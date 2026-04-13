#!/usr/bin/env node
/**
 * PreToolUse hook: scans staged agent files (under packages/sandbox/src/processes/**\/agents/*.ts
 * or packages/core/src/agents/*.ts) and warns if any define a class that does
 * NOT extend BaseGroundedAgent.
 *
 * Hook input is JSON on stdin per Claude Code's hook protocol.
 */
import { readFileSync, existsSync } from 'node:fs';

let payload = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (payload += c));
process.stdin.on('end', () => {
  try {
    const data = payload ? JSON.parse(payload) : {};
    const filePath =
      data?.tool_input?.file_path ??
      data?.tool_input?.path ??
      '';
    if (!filePath || typeof filePath !== 'string') {
      process.exit(0);
    }
    if (!/agents[\\/].*\.ts$/.test(filePath)) {
      process.exit(0);
    }
    if (!existsSync(filePath)) {
      process.exit(0);
    }
    const source = readFileSync(filePath, 'utf8');
    const hasClass = /class\s+\w+/.test(source);
    const extendsBase = /extends\s+BaseGroundedAgent\b/.test(source);
    if (hasClass && !extendsBase) {
      const msg =
        `[check-agent-ground] WARNING: ${filePath} defines a class but does not extend BaseGroundedAgent.\n` +
        `Every agent must walk the ground. See .github/instructions/agents.instructions.md.`;
      console.error(msg);
      // Soft warn — exit 0 so the user can still proceed if intentional.
      process.exit(0);
    }
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
