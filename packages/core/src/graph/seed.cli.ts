#!/usr/bin/env tsx
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env') });
import { ObligationGraph } from './ObligationGraph.js';
import { GraphSeeder } from './GraphSeeder.js';
import { closeAll } from '../db/connection.js';

async function main() {
  const dir = process.argv[2] ?? resolve(process.cwd(), 'regulations');
  // eslint-disable-next-line no-console
  console.log(`[seed:graph] Seeding from ${dir}`);
  const graph = new ObligationGraph();
  const seeder = new GraphSeeder(graph);
  const results = await seeder.seedAllRegulations(dir);
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(
      `[${r.file}] obligations=${r.obligationsLoaded} constraints=${r.constraintsLoaded} definitions=${r.definitionsLoaded} rels=${r.relationshipsLoaded}` +
        (r.errors.length ? ` errors=${r.errors.length}` : ''),
    );
    for (const e of r.errors) {
      // eslint-disable-next-line no-console
      console.error(`  ! ${e}`);
    }
  }
  await closeAll();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
