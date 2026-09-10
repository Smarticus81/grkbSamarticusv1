/**
 * Scenario-harness discovery and execution for every shipped process.
 *
 * Each process folder carries `harness/<process>-scenarios.yaml`. This module
 * finds those files (in `src/` during development and tests, in `dist/` once
 * built — see scripts/copy-harness-yaml.mjs), wires every registered agent
 * into a `TestHarness`, seeds the mock graph from the real regulation YAML
 * catalog, and runs the suites through `HarnessRunner`.
 *
 * It is the single code path behind `pnpm test:harness`, the API route
 * `POST /api/sandbox/harness/run`, and the web "Agent Harness" page.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AgentRegistry,
  HarnessRunner,
  TestHarness,
  loadObligationCatalog,
  summarizeSuites,
  type HarnessSummary,
  type ObligationCatalog,
  type ScenarioFile,
  type ScenarioSuiteResult,
} from '@regground/core';
import { ProcessRegistry } from './ProcessRegistry.js';
import { registerAllAgents, registerAllProcesses } from './registerAll.js';

const PROCESSES_DIR = dirname(fileURLToPath(import.meta.url));

export interface HarnessSuiteInfo {
  /** Stable id: `<process-folder>/<file-name-without-extension>`. */
  id: string;
  name: string;
  description?: string;
  /** Process folder name, e.g. `capa`. */
  process: string;
  /** Matching registered process definition id, when one exists. */
  processId?: string;
  processName?: string;
  file: string;
  scenarioCount: number;
  agents: string[];
  /** Parse problem, if the YAML does not satisfy the scenario schema. */
  error?: string;
}

export interface HarnessRunReport {
  startedAtIso: string;
  finishedAtIso: string;
  durationMs: number;
  summary: HarnessSummary;
  suites: (ScenarioSuiteResult & { id: string; process: string })[];
  catalog: { obligations: number; files: number; errors: number; dir: string | null };
}

/** Locate `packages/core/regulations` from wherever the sandbox is running. */
export function resolveRegulationsDir(): string | null {
  const fromEnv = process.env.REGGROUND_REGULATIONS_DIR;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  let cursor = PROCESSES_DIR;
  for (let i = 0; i < 10; i += 1) {
    const candidate = join(cursor, 'packages', 'core', 'regulations');
    if (existsSync(candidate)) return candidate;
    const sibling = join(cursor, 'core', 'regulations');
    if (existsSync(sibling)) return sibling;
    const parent = resolve(cursor, '..');
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

export function listHarnessSuiteFiles(root: string = PROCESSES_DIR): string[] {
  const out: string[] = [];
  let processFolders: string[] = [];
  try {
    processFolders = readdirSync(root).filter((e) => statSync(join(root, e)).isDirectory());
  } catch {
    return out;
  }
  for (const folder of processFolders.sort()) {
    const harnessDir = join(root, folder, 'harness');
    if (!existsSync(harnessDir)) continue;
    for (const file of readdirSync(harnessDir).sort()) {
      if (/\.ya?ml$/.test(file)) out.push(join(harnessDir, file));
    }
  }
  return out;
}

function suiteIdFor(file: string, root: string): string {
  const rel = file.slice(root.length + 1).split(/[\\/]/);
  const process = rel[0] ?? 'unknown';
  const base = (rel[rel.length - 1] ?? file).replace(/\.ya?ml$/, '');
  return `${process}/${base}`;
}

export function listHarnessSuites(root: string = PROCESSES_DIR): HarnessSuiteInfo[] {
  const processes = registerAllProcesses(new ProcessRegistry()).list();
  return listHarnessSuiteFiles(root).map((file) => {
    const id = suiteIdFor(file, root);
    const process = id.split('/')[0]!;
    const info: HarnessSuiteInfo = {
      id,
      name: id,
      process,
      file,
      scenarioCount: 0,
      agents: [],
    };
    try {
      const parsed: ScenarioFile = HarnessRunner.parse(readFileSync(file, 'utf8'));
      info.name = parsed.name ?? id;
      info.description = parsed.description;
      info.scenarioCount = parsed.scenarios.length;
      info.agents = Array.from(new Set(parsed.scenarios.map((s) => s.agent))).sort();
      // Folder names and process ids differ (e.g. `audit` vs `internal-audit`),
      // so match the definition through the agents the suite exercises.
      const def =
        processes.find((p) => info.agents.some((a) => p.requiredAgentTypes.includes(a))) ??
        processes.find((p) => p.processId === process);
      info.processId = def?.id;
      info.processName = def?.name;
    } catch (e) {
      info.error = e instanceof Error ? e.message : String(e);
    }
    return info;
  });
}

export interface HarnessRunnerBundle {
  harness: TestHarness;
  runner: HarnessRunner;
  catalog: ObligationCatalog | null;
  catalogDir: string | null;
}

/** Build a harness + runner with every shipped agent registered and the regulation catalog loaded. */
export function createSandboxHarnessRunner(options: { regulationsDir?: string | null } = {}): HarnessRunnerBundle {
  const harness = new TestHarness();
  const deps = harness.buildDeps();
  const agents = registerAllAgents(new AgentRegistry(), deps);
  const catalogDir = options.regulationsDir === undefined ? resolveRegulationsDir() : options.regulationsDir;
  const catalog = catalogDir ? loadObligationCatalog(catalogDir) : null;
  const runner = new HarnessRunner(
    harness,
    (name) => {
      const reg = agents.get(name);
      if (!reg) throw new Error(`Agent not registered: ${name}`);
      return reg.factory();
    },
    catalog ? { catalog } : {},
  );
  return { harness, runner, catalog, catalogDir };
}

export interface RunHarnessOptions {
  /** Restrict to these suite ids (as returned by `listHarnessSuites`). */
  suiteIds?: string[];
  root?: string;
  regulationsDir?: string | null;
}

export async function runHarnessSuites(options: RunHarnessOptions = {}): Promise<HarnessRunReport> {
  const started = new Date();
  const root = options.root ?? PROCESSES_DIR;
  const bundle = createSandboxHarnessRunner({ regulationsDir: options.regulationsDir });
  const wanted = options.suiteIds ? new Set(options.suiteIds) : null;
  const suites: HarnessRunReport['suites'] = [];
  for (const info of listHarnessSuites(root)) {
    if (wanted && !wanted.has(info.id)) continue;
    if (info.error) {
      suites.push({
        id: info.id,
        process: info.process,
        name: info.name,
        file: info.file,
        results: [],
        total: 0,
        passed: 0,
        failed: 1,
        durationMs: 0,
      });
      continue;
    }
    const result = await bundle.runner.runFile(info.file);
    suites.push({ ...result, id: info.id, process: info.process });
  }
  const finished = new Date();
  return {
    startedAtIso: started.toISOString(),
    finishedAtIso: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    summary: summarizeSuites(suites),
    suites,
    catalog: {
      obligations: bundle.catalog?.size ?? 0,
      files: bundle.catalog?.files.length ?? 0,
      errors: bundle.catalog?.errors.length ?? 0,
      dir: bundle.catalogDir,
    },
  };
}

export { summarizeSuites };
