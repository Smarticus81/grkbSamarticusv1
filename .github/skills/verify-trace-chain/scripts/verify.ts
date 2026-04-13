#!/usr/bin/env tsx
import { ChainVerifier, closeAll } from '../../../../packages/core/src/index.js';

async function main() {
  const processInstanceId = process.argv[2];
  if (!processInstanceId) {
    // eslint-disable-next-line no-console
    console.error('Usage: verify.ts <processInstanceId>');
    process.exit(2);
  }
  const verifier = new ChainVerifier();
  const report = await verifier.exportVerificationReport(processInstanceId);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  await closeAll();
  process.exit(report.chain.valid ? 0 : 1);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(2);
});
