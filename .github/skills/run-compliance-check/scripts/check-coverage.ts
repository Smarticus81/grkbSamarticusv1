#!/usr/bin/env tsx
import {
  ObligationGraph,
  QualificationGate,
  closeAll,
} from '../../../../packages/core/src/index.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const processType = arg('process-type') ?? 'CAPA';
  const jurisdiction = arg('jurisdiction') ?? 'GLOBAL';
  const evidence = (arg('evidence') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const graph = new ObligationGraph();
  const gate = new QualificationGate(graph);
  const result = await gate.check({
    processType,
    jurisdiction,
    availableEvidence: evidence,
    requiredObligations: [],
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    processType,
    jurisdiction,
    evidence,
    status: result.status,
    mandatoryTotal: result.mandatoryTotal,
    mandatoryCovered: result.mandatoryCovered,
    missingObligations: result.missingObligations,
    missingEvidence: result.missingEvidence,
    blockingErrors: result.blockingErrors,
  }, null, 2));

  await closeAll();
  process.exit(result.status === 'QUALIFIED' ? 0 : 1);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(2);
});
