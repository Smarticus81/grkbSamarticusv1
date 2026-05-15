#!/usr/bin/env tsx
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env') });
import { ObligationGraph } from './ObligationGraph.js';
import { GraphSeeder } from './GraphSeeder.js';
import { ProcessSeeder } from './ProcessSeeder.js';
import { closeAll } from '../db/connection.js';

async function main() {
  const dir = process.argv[2] ?? resolve(process.cwd(), 'regulations');
  const processesDir = process.argv[3] ?? resolve(dir, '..', 'processes');
  // eslint-disable-next-line no-console
  console.log(`[seed:graph] Seeding regulations from ${dir}`);
  const graph = new ObligationGraph();
  const seeder = new GraphSeeder(graph);
  const results = await seeder.seedAllRegulations(dir);
  for (const r of results) {
    // eslint-disable-next-line no-console
    const agentos =
      r.agentRolesLoaded + r.hitlGatesLoaded + r.policiesLoaded + r.slosLoaded + r.triggersLoaded;
    console.log(
      `[${r.file}] obligations=${r.obligationsLoaded} constraints=${r.constraintsLoaded} definitions=${r.definitionsLoaded} rels=${r.relationshipsLoaded}` +
        (agentos
          ? ` agentRoles=${r.agentRolesLoaded} hitlGates=${r.hitlGatesLoaded} policies=${r.policiesLoaded} slos=${r.slosLoaded} triggers=${r.triggersLoaded}`
          : '') +
        (r.errors.length ? ` errors=${r.errors.length}` : ''),
    );
    for (const e of r.errors) {
      // eslint-disable-next-line no-console
      console.error(`  ! ${e}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[seed:graph] Seeding processes from ${processesDir}`);
  const processSeeder = new ProcessSeeder(graph);
  const processResults = await processSeeder.seedAllProcesses(processesDir);
  let processFailures = 0;
  for (const r of processResults) {
    // eslint-disable-next-line no-console
    console.log(
      `[${r.file}] process=${r.processId} bound=${r.obligationsBound} missing=${r.obligationsMissing.length}` +
        (r.errors.length ? ` errors=${r.errors.length}` : ''),
    );
    for (const e of r.errors) {
      processFailures += 1;
      // eslint-disable-next-line no-console
      console.error(`  ! ${e}`);
    }
  }

  await closeAll();
  if (processFailures > 0) {
    // eslint-disable-next-line no-console
    console.error(`[seed:graph] FAILED — ${processFailures} process binding error(s).`);
    process.exit(2);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
