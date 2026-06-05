/**
 * SemanticContextBroker — semantic mediation layer between user chat
 * and the obligation knowledge graph.
 *
 * Performs:
 *  1. Intent extraction (LLM-driven, full conversation context)
 *  2. Hybrid retrieval (vector + structural graph queries)
 *  3. Graph expansion (constraints, definitions, evidence, HITL gates, policies)
 *  4. Reranking (reciprocal rank fusion + optional LLM rerank)
 *  5. Explanation packaging (SemanticContextBundle with provenance)
 *
 * The broker composes existing infrastructure:
 *  - ObligationDiscovery for hybrid tag+semantic discovery
 *  - EmbeddingClient for query vectorization
 *  - ObligationGraph for graph traversal and expansion
 *  - KBCatalog for authoritative ID enumeration
 *  - LLMAbstraction for intent extraction
 */

import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { ObligationGraph } from './ObligationGraph.js';
import { ObligationDiscovery, type ScoredObligation, type HybridDiscoveredScope } from './ObligationDiscovery.js';
import type { KBCatalog, KBCatalogSnapshot } from './KBCatalog.js';
import type { EmbeddingClient } from '../llm/EmbeddingClient.js';
import type { LLMAbstraction } from '../llm/LLMAbstraction.js';
import type {
  ObligationNode,
  ConstraintNode,
  DefinitionNode,
  ObligationExplanation,
} from './types.js';

// ─── Intent schema ───────────────────────────────────────────────────────

export const ExtractedIntentSchema = z.object({
  /** Inferred process type(s) (e.g. ["complaint-handling", "vigilance-reporting"]) */
  processTypes: z.array(z.string().min(1)).min(1).max(6),
  /** Inferred jurisdiction(s) (e.g. ["EU", "US"]) */
  jurisdictions: z.array(z.string().min(1)).min(1).max(6),
  /** Device classification context, if mentioned */
  deviceClass: z.string().max(40).optional(),
  /** Operator/user role context (e.g. "manufacturer", "authorized rep") */
  operatorRole: z.string().max(80).optional(),
  /** Risk level context */
  riskLevel: z.enum(['low', 'medium', 'high', 'unknown']),
  /** QMS domain areas the request touches */
  qmsDomains: z.array(z.string().min(1).max(80)).max(10),
  /** Evidence types the user is likely requesting or would need */
  likelyEvidenceTypes: z.array(z.string().min(1).max(80)).max(10),
  /** What the user wants produced (e.g. "workflow for handling complaints") */
  requestedOutput: z.string().min(1).max(500),
  /** Open questions or ambiguities that should be clarified */
  ambiguities: z.array(z.string().min(1).max(300)).max(10),
  /** Retrieval queries to run against the obligation graph — diverse phrasings */
  retrievalQueries: z.array(z.string().min(5).max(300)).min(1).max(5),
  /** One-sentence summary of the user's intent */
  summary: z.string().min(1).max(500),
});
export type ExtractedIntent = z.infer<typeof ExtractedIntentSchema>;

// ─── Ranked obligation with expansion ────────────────────────────────────

export interface RankedObligation {
  obligation: ObligationNode;
  /** How this obligation was found */
  matchedBy: 'tag' | 'semantic' | 'both' | 'graph_expansion';
  /** Cosine similarity score from vector search (if applicable) */
  semanticScore?: number;
  /** Fused rank score (lower = better) */
  fusedRank: number;
  /** Whether this is authoritative (GOVERNED_BY tether) or a candidate */
  authoritative: boolean;
  /** Constraints that apply to this obligation */
  constraints: ConstraintNode[];
  /** Required evidence types */
  requiredEvidenceTypes: string[];
  /** Cross-referenced obligation IDs */
  crossReferences: string[];
  /** Plain English explanation chain (from explainObligation) */
  explanationChain: string[];
}

export interface RetrievedDefinition {
  definition: DefinitionNode;
  /** Cosine similarity score (if found via semantic search) */
  semanticScore?: number;
  /** Which obligations reference this definition */
  referencedByObligations: string[];
}

// ─── The bundle returned to the builder ──────────────────────────────────

export interface SemanticContextBundle {
  /** Structured understanding of the user's request */
  intent: ExtractedIntent;

  /** Authoritative obligations — graph-tethered, safe for grounding */
  obligations: RankedObligation[];

  /** Semantic-only candidates — not graph-tethered, for exploration */
  candidates: RankedObligation[];

  /** Definitions relevant to the discovered obligations */
  definitions: RetrievedDefinition[];

  /** HITL gates applicable to discovered obligations */
  hitlGates: Array<{ gateId: string; appliesTo: string; approverRole: string; description: string; slaHours: number | null }>;

  /** Governance policies in scope */
  policies: Array<{ policyId: string; policyClass: string; appliesTo: string[]; description: string }>;

  /** The full catalog snapshot (for validation and non-semantic artifact types) */
  catalogSnapshot: KBCatalogSnapshot;

  /** Retrieval metadata for provenance and tracing */
  retrieval: RetrievalMetadata;
}

export interface RetrievalMetadata {
  /** SHA-256 of the concatenated retrieval queries */
  queryHash: string;
  /** How many obligations were considered in total */
  totalConsidered: number;
  /** How many obligations made it into the authoritative set */
  totalAuthoritative: number;
  /** How many are semantic-only candidates */
  totalCandidates: number;
  /** Whether embeddings were available for semantic search */
  embeddingsAvailable: boolean;
  /** If embeddings unavailable, the degraded mode reason */
  degradedReason?: string;
  /** Obligation IDs that were selected */
  selectedObligationIds: string[];
  /** Obligation IDs that were considered but rejected */
  rejectedCandidateIds: string[];
  /** Graph coverage: how many of the filtered catalog obligations appear in results */
  catalogCoverage: { total: number; covered: number; ratio: number };
  /** Timing breakdown */
  timings: {
    intentExtractionMs: number;
    embeddingMs: number;
    hybridRetrievalMs: number;
    graphExpansionMs: number;
    rerankMs: number;
    totalMs: number;
  };
}

// ─── Broker options ──────────────────────────────────────────────────────

export interface SemanticContextBrokerOptions {
  /** Max authoritative obligations to include (default 40) */
  maxAuthoritative?: number;
  /** Max semantic-only candidates to include (default 15) */
  maxCandidates?: number;
  /** Semantic search K (default 30) */
  semanticK?: number;
  /** Whether to run LLM reranking (default false — uses RRF only) */
  llmRerank?: boolean;
}

// ─── The broker ──────────────────────────────────────────────────────────

const INTENT_SYSTEM_PROMPT = `You are a regulatory-intent extraction engine for a medical device QMS platform.

Given a multi-turn conversation between a user and the Process Designer assistant, extract the user's structured regulatory intent. Focus on:
- What QMS process they want to build or modify
- Which jurisdictions and regulations are relevant
- What device/risk context is implied
- What evidence or outputs they need
- Any ambiguities or missing information

Generate diverse retrieval queries that would find the right regulatory obligations in a knowledge graph. Include at least one query for each distinct regulatory domain the request touches.

Be specific about process types. Map natural language to standard QMS process types:
complaint-handling, vigilance-reporting, capa, change-control, audit, nonconformance, trend-reporting, design-control, risk-management, post-market-surveillance, supplier-management, document-control, training, management-review, clinical-evaluation.

If the conversation is ambiguous about jurisdiction, default to the most commonly regulated markets (EU, US). If device class is unknown, note it as an ambiguity.`;

export class SemanticContextBroker {
  private readonly discovery: ObligationDiscovery;

  constructor(
    private readonly graph: ObligationGraph,
    private readonly catalog: KBCatalog,
    private readonly llm: LLMAbstraction,
    private readonly embeddings: EmbeddingClient | null,
  ) {
    this.discovery = new ObligationDiscovery(graph);
  }

  /**
   * Resolve a user conversation into a ranked, graph-expanded semantic context
   * bundle suitable for grounded workflow generation.
   */
  async resolve(
    conversation: Array<{ role: 'user' | 'assistant'; content: string }>,
    currentRequest: string,
    filters?: { jurisdiction?: string; processType?: string },
    options: SemanticContextBrokerOptions = {},
  ): Promise<SemanticContextBundle> {
    const t0 = Date.now();
    const maxAuth = options.maxAuthoritative ?? 40;
    const maxCand = options.maxCandidates ?? 15;
    const semanticK = options.semanticK ?? 30;

    // ── 1. Intent extraction ──
    const tIntent0 = Date.now();
    const intent = await this.extractIntent(conversation, currentRequest, filters);
    const intentMs = Date.now() - tIntent0;

    // Apply explicit filters over inferred intent
    const processTypes = filters?.processType
      ? [filters.processType, ...intent.processTypes.filter((p) => p !== filters.processType)]
      : intent.processTypes;
    const jurisdictions = filters?.jurisdiction
      ? [filters.jurisdiction, ...intent.jurisdictions.filter((j) => j !== filters.jurisdiction)]
      : intent.jurisdictions;

    // ── 2. Embed retrieval queries ──
    const tEmbed0 = Date.now();
    let queryVectors: number[][] = [];
    let embeddingsAvailable = false;
    let degradedReason: string | undefined;

    if (this.embeddings) {
      try {
        const queries = [currentRequest, ...intent.retrievalQueries];
        const result = await this.embeddings.embed(queries);
        queryVectors = result.vectors;
        embeddingsAvailable = true;
      } catch (e) {
        degradedReason = `Embedding failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      degradedReason = 'No embedding client configured';
    }
    const embedMs = Date.now() - tEmbed0;

    // ── 3. Hybrid retrieval ──
    const tRetrieval0 = Date.now();
    let hybridScope: HybridDiscoveredScope | null = null;
    let tagOnlyFallback = false;

    if (embeddingsAvailable && queryVectors.length > 0) {
      // Use the first query vector (the raw user request) for hybrid discovery
      hybridScope = await this.discovery.discoverHybrid(
        processTypes,
        jurisdictions,
        queryVectors[0]!,
        semanticK,
      );

      // Run additional semantic searches with the generated retrieval queries
      // and merge any new candidates
      for (let i = 1; i < queryVectors.length; i++) {
        const additionalHits = await this.discovery.semanticSearch(
          queryVectors[i]!,
          Math.ceil(semanticK / 2),
          {
            jurisdiction: filters?.jurisdiction,
            processType: filters?.processType,
            deviceClass: intent.deviceClass,
            operatorRole: intent.operatorRole,
          },
        );

        const existingIds = new Set([
          ...hybridScope.scored.map((s) => s.obligation.obligationId),
          ...hybridScope.candidates.map((c) => c.obligation.obligationId),
        ]);

        for (const hit of additionalHits) {
          if (!existingIds.has(hit.obligation.obligationId)) {
            hybridScope.candidates.push(hit);
            existingIds.add(hit.obligation.obligationId);
          }
        }
      }
    } else {
      // Degraded mode: structural-only discovery
      const tagScope = await this.discovery.discover(processTypes, jurisdictions);
      hybridScope = {
        ...tagScope,
        scored: tagScope.obligations.map((o) => ({
          obligation: o,
          matchedBy: 'tag' as const,
        })),
        candidates: [],
      };
      tagOnlyFallback = true;
    }
    const retrievalMs = Date.now() - tRetrieval0;

    // ── 4. Graph expansion + reranking ──
    const tExpand0 = Date.now();

    // Expand authoritative obligations with graph context
    const expandedAuthoritative = await this.expandAndRank(
      hybridScope.scored,
      maxAuth,
    );

    // Expand candidates (lighter — fewer graph calls)
    const expandedCandidates = await this.expandAndRank(
      hybridScope.candidates,
      maxCand,
    );

    const expandMs = Date.now() - tExpand0;

    // ── 5. Rerank ──
    const tRerank0 = Date.now();

    // Apply reciprocal rank fusion across tag rank and semantic score
    this.applyRRF(expandedAuthoritative);
    this.applyRRF(expandedCandidates);

    // Sort by fused rank (lower = better)
    expandedAuthoritative.sort((a, b) => a.fusedRank - b.fusedRank);
    expandedCandidates.sort((a, b) => a.fusedRank - b.fusedRank);

    // Trim to limits
    const finalAuthoritative = expandedAuthoritative.slice(0, maxAuth);
    const finalCandidates = expandedCandidates.slice(0, maxCand);

    const rerankMs = Date.now() - tRerank0;

    // ── 6. Collect definitions ──
    const definitions = await this.collectDefinitions(
      [...finalAuthoritative, ...finalCandidates].map((r) => r.obligation.obligationId),
    );

    // ── 7. Catalog snapshot for validation ──
    const catalogSnapshot = await this.catalog.snapshot({
      jurisdiction: filters?.jurisdiction,
      processType: filters?.processType,
    });

    // ── 8. Extract HITL gates and policies from catalog ──
    const relevantObligationIds = new Set(finalAuthoritative.map((r) => r.obligation.obligationId));

    const hitlGates = catalogSnapshot.hitlGates
      .filter((g) => relevantObligationIds.has(g.appliesTo))
      .map((g) => ({
        gateId: g.gateId,
        appliesTo: g.appliesTo,
        approverRole: g.approverRole,
        description: g.description,
        slaHours: g.slaHours,
      }));

    const policies = catalogSnapshot.policies
      .filter((p) => p.appliesTo.some((a) => relevantObligationIds.has(a)))
      .map((p) => ({
        policyId: p.policyId,
        policyClass: p.policyClass,
        appliesTo: p.appliesTo,
        description: p.description,
      }));

    // ── 9. Build retrieval metadata ──
    const queryHash = this.hashQueries([currentRequest, ...intent.retrievalQueries]);

    const selectedIds = finalAuthoritative.map((r) => r.obligation.obligationId);
    const rejectedIds = finalCandidates.map((r) => r.obligation.obligationId);

    const catalogObligationIds = new Set(catalogSnapshot.obligations.map((o) => o.obligationId));
    const coveredCount = selectedIds.filter((id) => catalogObligationIds.has(id)).length;

    const totalMs = Date.now() - t0;

    const retrieval: RetrievalMetadata = {
      queryHash,
      totalConsidered: expandedAuthoritative.length + expandedCandidates.length,
      totalAuthoritative: finalAuthoritative.length,
      totalCandidates: finalCandidates.length,
      embeddingsAvailable,
      degradedReason: tagOnlyFallback
        ? degradedReason ?? 'Structural-only fallback (no embeddings)'
        : degradedReason,
      selectedObligationIds: selectedIds,
      rejectedCandidateIds: rejectedIds,
      catalogCoverage: {
        total: catalogSnapshot.obligations.length,
        covered: coveredCount,
        ratio: catalogSnapshot.obligations.length > 0
          ? coveredCount / catalogSnapshot.obligations.length
          : 0,
      },
      timings: {
        intentExtractionMs: intentMs,
        embeddingMs: embedMs,
        hybridRetrievalMs: retrievalMs,
        graphExpansionMs: expandMs,
        rerankMs: rerankMs,
        totalMs,
      },
    };

    return {
      intent,
      obligations: finalAuthoritative,
      candidates: finalCandidates,
      definitions,
      hitlGates,
      policies,
      catalogSnapshot,
      retrieval,
    };
  }

  // ── Intent extraction via LLM ──────────────────────────────────────────

  private async extractIntent(
    conversation: Array<{ role: 'user' | 'assistant'; content: string }>,
    currentRequest: string,
    filters?: { jurisdiction?: string; processType?: string },
  ): Promise<ExtractedIntent> {
    const conversationText = conversation.length > 0
      ? conversation.map((t) => `${t.role}: ${t.content}`).join('\n')
      : '';

    const userMessage = [
      conversationText ? `CONVERSATION HISTORY:\n${conversationText}\n\n` : '',
      `CURRENT REQUEST:\n${currentRequest}`,
      filters?.jurisdiction ? `\nExplicit jurisdiction filter: ${filters.jurisdiction}` : '',
      filters?.processType ? `\nExplicit process type filter: ${filters.processType}` : '',
    ].join('');

    return this.llm.completeJSON<ExtractedIntent>(
      {
        messages: [
          { role: 'system', content: INTENT_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        // Budget must be high enough for reasoning models that consume
        // thinking tokens from the same max_tokens pool (e.g. DeepSeek V4).
        maxTokens: 16384,
        metadata: { agent: 'SemanticContextBroker', phase: 'intent_extraction' },
      },
      ExtractedIntentSchema,
      { structuredOutput: true, reasoningTrace: true },
    );
  }

  // ── Graph expansion ────────────────────────────────────────────────────

  private async expandAndRank(
    scored: ScoredObligation[],
    limit: number,
  ): Promise<RankedObligation[]> {
    const results: RankedObligation[] = [];
    const toExpand = scored.slice(0, limit + 10); // over-fetch slightly for reranking

    for (const item of toExpand) {
      let explanation: ObligationExplanation | null = null;
      try {
        explanation = await this.graph.explainObligation(item.obligation.obligationId);
      } catch {
        // Graph explain may fail for some nodes — continue
      }

      let constraints: ConstraintNode[] = [];
      try {
        constraints = await this.graph.getConstraints(item.obligation.obligationId);
      } catch {
        // Non-fatal
      }

      let requiredEvidenceTypes: string[] = [];
      try {
        requiredEvidenceTypes = await this.graph.getRequiredEvidence(item.obligation.obligationId);
      } catch {
        // Non-fatal
      }

      results.push({
        obligation: item.obligation,
        matchedBy: item.matchedBy,
        semanticScore: item.semanticScore,
        fusedRank: 0, // computed in rerank step
        authoritative: item.matchedBy === 'tag' || item.matchedBy === 'both',
        constraints,
        requiredEvidenceTypes,
        crossReferences: explanation?.crossReferences.map((cr) => cr.obligationId) ?? [],
        explanationChain: explanation?.plainEnglishChain ?? [],
      });
    }

    return results;
  }

  // ── Reciprocal Rank Fusion ─────────────────────────────────────────────

  private applyRRF(ranked: RankedObligation[], k = 60): void {
    // Build separate rank lists
    // 1. Tag rank: authoritative obligations by their original order (tag-matched first)
    // 2. Semantic rank: by cosine score descending
    const tagOrder = ranked
      .filter((r) => r.matchedBy === 'tag' || r.matchedBy === 'both')
      .map((r) => r.obligation.obligationId);

    const semanticOrder = [...ranked]
      .filter((r) => r.semanticScore !== undefined)
      .sort((a, b) => (b.semanticScore ?? 0) - (a.semanticScore ?? 0))
      .map((r) => r.obligation.obligationId);

    for (const item of ranked) {
      const id = item.obligation.obligationId;
      const tagIdx = tagOrder.indexOf(id);
      const semIdx = semanticOrder.indexOf(id);

      const tagScore = tagIdx >= 0 ? 1.0 / (k + tagIdx + 1) : 0;
      const semScore = semIdx >= 0 ? 1.0 / (k + semIdx + 1) : 0;

      // Bonus for mandatory obligations
      const mandatoryBonus = item.obligation.mandatory ? 0.005 : 0;

      // Bonus for having both tag and semantic match
      const dualMatchBonus = item.matchedBy === 'both' ? 0.003 : 0;

      item.fusedRank = -(tagScore + semScore + mandatoryBonus + dualMatchBonus);
    }
  }

  // ── Definition collection ──────────────────────────────────────────────

  private async collectDefinitions(
    obligationIds: string[],
  ): Promise<RetrievedDefinition[]> {
    const definitionMap = new Map<string, RetrievedDefinition>();

    for (const oblId of obligationIds) {
      try {
        const explanation = await this.graph.explainObligation(oblId);
        // explainObligation doesn't directly return definitions,
        // but we can pull semantic definition search if embeddings are available
      } catch {
        // continue
      }
    }

    // If we have embeddings, do a semantic definition search
    if (this.embeddings) {
      try {
        // Build a query from all obligation texts
        const sampleTexts = obligationIds.slice(0, 5);
        const queryText = `Key regulatory definitions and terms for obligations: ${sampleTexts.join(', ')}`;
        const vec = await this.embeddings.embedOne(queryText);
        const defHits = await this.graph.semanticSearchDefinitions(vec, 20);
        for (const hit of defHits) {
          const id = hit.definition.definitionId;
          if (!definitionMap.has(id)) {
            definitionMap.set(id, {
              definition: hit.definition,
              semanticScore: hit.score,
              referencedByObligations: [],
            });
          }
        }
      } catch {
        // Non-fatal
      }
    }

    return Array.from(definitionMap.values());
  }

  // ── Utility ────────────────────────────────────────────────────────────

  private hashQueries(queries: string[]): string {
    return createHash('sha256').update(queries.join('||')).digest('hex');
  }

  /**
   * Summarize the semantic context bundle into a compact JSON string
   * suitable for injection into an LLM prompt. This replaces the raw
   * catalog dump with a ranked, intent-aware context.
   */
  static summarizeForPrompt(bundle: SemanticContextBundle, maxObligations = 40): string {
    const obligations = bundle.obligations.slice(0, maxObligations).map((r) => ({
      id: r.obligation.obligationId,
      reg: r.obligation.sourceCitation,
      section: r.obligation.artifactType,
      text: r.obligation.text.length > 280 ? `${r.obligation.text.slice(0, 280)}…` : r.obligation.text,
      mandatory: r.obligation.mandatory,
      matchedBy: r.matchedBy,
      requiredEvidenceTypes: r.requiredEvidenceTypes,
      constraints: r.constraints.map((c) => ({
        id: c.constraintId,
        text: c.text.length > 200 ? `${c.text.slice(0, 200)}…` : c.text,
        severity: c.severity,
      })),
      crossRefs: r.crossReferences.slice(0, 5),
      explanation: r.explanationChain.slice(0, 3),
    }));

    const candidates = bundle.candidates.slice(0, 10).map((r) => ({
      id: r.obligation.obligationId,
      reg: r.obligation.sourceCitation,
      text: r.obligation.text.length > 200 ? `${r.obligation.text.slice(0, 200)}…` : r.obligation.text,
      semanticScore: r.semanticScore,
      note: 'semantic-only candidate — do NOT use as grounded ref unless you can validate it belongs to this process',
    }));

    return JSON.stringify({
      inferredIntent: {
        processTypes: bundle.intent.processTypes,
        jurisdictions: bundle.intent.jurisdictions,
        riskLevel: bundle.intent.riskLevel,
        requestedOutput: bundle.intent.requestedOutput,
        ambiguities: bundle.intent.ambiguities,
      },
      obligations,
      obligationsTotalAuthoritative: bundle.obligations.length,
      candidates,
      candidatesTotal: bundle.candidates.length,
      definitions: bundle.definitions.slice(0, 15).map((d) => ({
        id: d.definition.definitionId,
        term: d.definition.term,
        text: d.definition.text.length > 200 ? `${d.definition.text.slice(0, 200)}…` : d.definition.text,
      })),
      hitlGates: bundle.hitlGates.map((g) => ({
        id: g.gateId,
        appliesTo: g.appliesTo,
        approverRole: g.approverRole,
        slaHours: g.slaHours,
        description: g.description,
      })),
      policies: bundle.policies.map((p) => ({
        id: p.policyId,
        class: p.policyClass,
        appliesTo: p.appliesTo,
        description: p.description,
      })),
      // Include remaining catalog artifacts that aren't obligation-specific
      agentRoles: bundle.catalogSnapshot.agentRoles.map((a) => ({
        id: a.agentRoleId,
        name: a.name,
        description: a.description,
        processIds: a.processIds,
      })),
      slos: bundle.catalogSnapshot.slos.map((s) => ({
        id: s.sloId,
        appliesTo: s.appliesTo,
        metric: s.metric,
        threshold: s.threshold,
        unit: s.unit,
      })),
      triggers: bundle.catalogSnapshot.triggers.map((t) => ({
        id: t.triggerId,
        processId: t.processId,
        triggerType: t.triggerType,
        schedule: t.schedule,
        eventType: t.eventType,
      })),
      evidenceTypes: bundle.catalogSnapshot.evidenceTypes.map((e) => e.evidenceType),
      jurisdictions: bundle.catalogSnapshot.jurisdictions,
      processTypes: bundle.catalogSnapshot.processTypes,
      retrievalMode: bundle.retrieval.embeddingsAvailable ? 'hybrid' : 'structural-only',
      degradedReason: bundle.retrieval.degradedReason,
    }, null, 2);
  }
}
