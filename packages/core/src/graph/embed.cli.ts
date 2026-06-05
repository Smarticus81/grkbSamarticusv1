#!/usr/bin/env node
/**
 * Backfill CLI: embeds title + text for every Obligation/Definition node
 * that lacks a current embedding (or was embedded with a different model).
 *
 * Usage:
 *   pnpm embed:graph                  # embed all unembedded nodes
 *   pnpm embed:graph --force          # re-embed everything
 *   pnpm embed:graph --batch-size 50  # custom batch size
 *
 * Idempotent: tracks embeddingModel + embeddedAt on each node so
 * re-embeds are detectable and skippable.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env') });

import { getNeo4j } from '../db/connection.js';
import { ObligationGraph } from './ObligationGraph.js';
import { EmbeddingClient } from '../llm/EmbeddingClient.js';

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const batchSizeIdx = args.indexOf('--batch-size');
  const batchSize = batchSizeIdx >= 0 ? parseInt(args[batchSizeIdx + 1]!, 10) : 100;

  console.log('🔗 Connecting to Neo4j...');
  const driver = getNeo4j();
  const graph = new ObligationGraph(driver);

  console.log('🧠 Initializing embedding client...');
  const embedder = EmbeddingClient.fromEnv();
  console.log(`   Provider: ${embedder.providerName}, Model: ${embedder.model}, Dims: ${embedder.dimensions}`);

  // Ensure vector indexes exist
  console.log('📐 Ensuring vector indexes...');
  await graph.ensureVectorIndexes(embedder.dimensions);

  // Get nodes needing embedding
  const currentModel = force ? '__force_reembed__' : embedder.model;
  const nodes = await graph.getNodesNeedingEmbedding(currentModel);
  console.log(`📊 Found ${nodes.length} nodes needing embedding.`);

  if (nodes.length === 0) {
    console.log('✅ All nodes already have current embeddings. Nothing to do.');
    await driver.close();
    return;
  }

  let embedded = 0;
  let totalTokens = 0;
  const errors: string[] = [];

  // Process in batches
  for (let i = 0; i < nodes.length; i += batchSize) {
    const batch = nodes.slice(i, i + batchSize);
    const texts = batch.map((n) => n.text);

    try {
      const result = await embedder.embed(texts);
      totalTokens += result.totalTokens ?? 0;

      // Upsert each embedding
      for (let j = 0; j < batch.length; j++) {
        const node = batch[j]!;
        const vector = result.vectors[j]!;
        try {
          await graph.upsertEmbedding(node.id, vector, embedder.model);
          embedded++;
        } catch (err) {
          const msg = `Failed to upsert embedding for ${node.id}: ${err instanceof Error ? err.message : err}`;
          errors.push(msg);
          console.error(`  ❌ ${msg}`);
        }
      }

      const pct = Math.round(((i + batch.length) / nodes.length) * 100);
      console.log(`  📦 Batch ${Math.floor(i / batchSize) + 1}: embedded ${batch.length} nodes (${pct}% complete)`);
    } catch (err) {
      const msg = `Batch starting at index ${i} failed: ${err instanceof Error ? err.message : err}`;
      errors.push(msg);
      console.error(`  ❌ ${msg}`);
    }
  }

  // Report
  console.log('\n═══════════════════════════════════════');
  console.log('  Embedding Backfill Report');
  console.log('═══════════════════════════════════════');
  console.log(`  Provider:     ${embedder.providerName}`);
  console.log(`  Model:        ${embedder.model}`);
  console.log(`  Dimensions:   ${embedder.dimensions}`);
  console.log(`  Embedded:     ${embedded}/${nodes.length}`);
  console.log(`  Total tokens: ${totalTokens}`);
  if (errors.length > 0) {
    console.log(`  Errors:       ${errors.length}`);
    for (const e of errors) console.log(`    - ${e}`);
  }
  console.log('═══════════════════════════════════════\n');

  await driver.close();

  if (errors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
