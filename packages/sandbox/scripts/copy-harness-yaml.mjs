// Mirrors src/processes/**/harness/*.yaml into dist so the compiled sandbox
// (and the API image built from it) can list and run the scenario suites.
import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(pkgRoot, 'src', 'processes');
const distRoot = join(pkgRoot, 'dist', 'sandbox', 'src', 'processes');

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.ya?ml$/.test(entry) && dir.endsWith('harness')) yield full;
  }
}

let copied = 0;
for (const file of walk(srcRoot)) {
  const target = join(distRoot, relative(srcRoot, file));
  mkdirSync(dirname(target), { recursive: true });
  cpSync(file, target);
  copied += 1;
}
console.log(`[sandbox] copied ${copied} harness scenario file(s) into dist`);
