#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TraceExporter, ChainVerifier, closeAll } from '../../../../packages/core/src/index.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const processInstanceId = arg('process-instance');
  const out = arg('out') ?? './audit-pack';
  if (!processInstanceId) {
    // eslint-disable-next-line no-console
    console.error('Usage: export.ts --process-instance <id> --out <dir>');
    process.exit(2);
  }
  mkdirSync(out, { recursive: true });

  const exporter = new TraceExporter();
  const verifier = new ChainVerifier();

  const jsonl = await exporter.toJSONL(processInstanceId);
  writeFileSync(join(out, 'trace.jsonl'), jsonl);

  const dot = await exporter.toDOT(processInstanceId);
  writeFileSync(join(out, 'trace.dot'), dot);

  const audit = await exporter.toAuditReport(processInstanceId);
  writeFileSync(join(out, 'audit-report.json'), JSON.stringify(audit, null, 2));

  const verification = await verifier.exportVerificationReport(processInstanceId);
  writeFileSync(join(out, 'verification.json'), JSON.stringify(verification, null, 2));

  // eslint-disable-next-line no-console
  console.log(`Audit pack exported to ${out}`);
  await closeAll();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
