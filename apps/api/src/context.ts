import {
  ChainVerifier,
  DecisionTraceService,
  ObligationGraph,
  TraceExporter,
} from '@regground/core';

/**
 * Process-wide singletons. Constructed once on API boot, injected into routes.
 *
 * Slimmed down to only what the active routes need:
 *   - graph.ts       → graph (ObligationGraph)
 *   - traces.ts      → traceService, chainVerifier, traceExporter
 *   - api-keys.ts    → self-contained (no context needed)
 */
export interface AppContext {
  graph: ObligationGraph;
  traceService: DecisionTraceService;
  chainVerifier: ChainVerifier;
  traceExporter: TraceExporter;
}

let context: AppContext | null = null;

export function getContext(): AppContext {
  if (context) return context;

  const graph = new ObligationGraph();
  const traceService = new DecisionTraceService();

  context = {
    graph,
    traceService,
    chainVerifier: new ChainVerifier(traceService),
    traceExporter: new TraceExporter(traceService),
  };

  return context;
}
