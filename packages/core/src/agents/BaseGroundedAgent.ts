import type { ZodSchema } from 'zod';
import type { ObligationGraph } from '../graph/ObligationGraph.js';
import type { ObligationNode, ConstraintNode } from '../graph/types.js';
import { DecisionTraceService } from '../traceability/DecisionTraceService.js';
import { QualificationGate } from '../guardrails/QualificationGate.js';
import { ComplianceValidator } from '../guardrails/ComplianceValidator.js';
import { StrictGate } from '../guardrails/StrictGate.js';
import type { CompliancePipeline } from '../guardrails/CompliancePipeline.js';
import type { ValidationReport } from '../guardrails/validators/types.js';
import type { LLMAbstraction } from '../llm/LLMAbstraction.js';
import type { LLMRequest } from '../llm/types.js';
import { PromptComposer, type FileContext, type SkillContext } from './PromptComposer.js';
import { AgentMetrics } from './AgentMetrics.js';
import type {
  GroundedAgentConfig,
  GroundedAgentContext,
  GroundedAgentResult,
  LLMCallResult,
} from './types.js';

export interface BaseGroundedAgentDeps {
  graph: ObligationGraph;
  traceService: DecisionTraceService;
  qualificationGate: QualificationGate;
  complianceValidator: ComplianceValidator;
  strictGate: StrictGate;
  promptComposer: PromptComposer;
  llm: LLMAbstraction;
  /** Optional compliance pipeline for Phase 1G multi-validator checks. */
  compliancePipeline?: CompliancePipeline;
}

/**
 * SEALED lifecycle. Subclasses override `execute`, `getRequiredObligations`,
 * `getOutputSchema`, and (optionally) `initialize` / `cleanup`. They MAY NOT
 * override `run()`. The lifecycle enforces:
 *
 *   1. Qualification gate (pre-execution)
 *   2. Obligation + constraint loading from the graph
 *   3. AGENT_SPAWNED trace
 *   4. initialize() hook
 *   5. execute() (subclass)
 *   6. StrictGate output validation
 *   7. ComplianceValidator
 *   8. AGENT_COMPLETED trace
 *   9. cleanup() hook (always runs)
 */
export abstract class BaseGroundedAgent<TInput, TOutput> {
  readonly agentId: string;
  protected readonly config: GroundedAgentConfig;
  protected readonly metrics = new AgentMetrics();

  protected readonly graph: ObligationGraph;
  protected readonly traceService: DecisionTraceService;
  protected readonly qualificationGate: QualificationGate;
  protected readonly complianceValidator: ComplianceValidator;
  protected readonly strictGate: StrictGate;
  protected readonly promptComposer: PromptComposer;
  protected readonly llm: LLMAbstraction;
  protected readonly compliancePipeline?: CompliancePipeline;

  constructor(config: GroundedAgentConfig, deps: BaseGroundedAgentDeps) {
    this.agentId = `${config.name}@${config.version}`;
    this.config = config;
    this.graph = deps.graph;
    this.traceService = deps.traceService;
    this.qualificationGate = deps.qualificationGate;
    this.complianceValidator = deps.complianceValidator;
    this.strictGate = deps.strictGate;
    this.promptComposer = deps.promptComposer;
    this.llm = deps.llm;
    this.compliancePipeline = deps.compliancePipeline;
  }

  // *** SEALED — do not override ***
  async run(
    input: TInput,
    context: GroundedAgentContext,
  ): Promise<GroundedAgentResult<TOutput>> {
    this.metrics.reset();

    // 1. QUALIFICATION
    const qualification = await this.qualificationGate.check({
      processType: context.processType,
      jurisdiction: context.jurisdiction,
      availableEvidence: context.availableEvidenceTypes,
      requiredObligations: this.getRequiredObligations(),
    });

    // Gate on qualification status: only QUALIFIED and QUALIFIED_WITH_WARNINGS proceed.
    if (qualification.status === 'BLOCKED' || qualification.status === 'OUT_OF_SCOPE') {
      await this.traceService.logEvent(context.traceCtx, {
        eventType: 'QUALIFICATION_BLOCKED',
        actor: this.agentId,
        reasons: qualification.blockingErrors,
        humanSummary: `Qualification ${qualification.status.toLowerCase()} for ${this.config.name} (risk: ${qualification.riskLevel})`,
      });
      return {
        success: false,
        error: `Qualification ${qualification.status.toLowerCase()}: ${qualification.blockingErrors.join('; ') || 'no applicable obligations'}`,
        qualification,
        traceId: context.traceCtx.traceId,
        metrics: this.metrics.snapshot(),
      };
    }

    if (qualification.status === 'NEEDS_HUMAN_REVIEW') {
      await this.traceService.logEvent(context.traceCtx, {
        eventType: 'QUALIFICATION_BLOCKED',
        actor: this.agentId,
        reasons: qualification.blockingErrors,
        humanSummary: `Qualification requires human review for ${this.config.name} — coverage ${(qualification.coverageScore * 100).toFixed(0)}% (risk: ${qualification.riskLevel})`,
      });
      return {
        success: false,
        error: `Qualification requires human review: coverage is ${(qualification.coverageScore * 100).toFixed(0)}%, canProceedWithHumanApproval=${qualification.canProceedWithHumanApproval}`,
        qualification,
        traceId: context.traceCtx.traceId,
        metrics: this.metrics.snapshot(),
        warnings: qualification.recommendedNextActions,
      };
    }

    // QUALIFIED_WITH_WARNINGS — proceed but log warnings.
    if (qualification.status === 'QUALIFIED_WITH_WARNINGS') {
      for (const action of qualification.recommendedNextActions) {
        this.metrics.warn(action);
      }
      await this.traceService.logEvent(context.traceCtx, {
        eventType: 'QUALIFICATION_PASSED',
        actor: this.agentId,
        humanSummary: `Qualification passed with warnings (${qualification.mandatoryCovered}/${qualification.mandatoryTotal}, risk: ${qualification.riskLevel})`,
      });
    } else {
      // QUALIFIED
      await this.traceService.logEvent(context.traceCtx, {
        eventType: 'QUALIFICATION_PASSED',
        actor: this.agentId,
        humanSummary: `Qualification passed (${qualification.mandatoryCovered}/${qualification.mandatoryTotal})`,
      });
    }

    // 2. LOAD OBLIGATIONS + CONSTRAINTS
    const obligations = await this.graph.getObligationsForProcess(
      context.processType,
      context.jurisdiction,
    );
    const constraints = await this.loadConstraints(obligations);

    // 3. AGENT_SPAWNED
    await this.traceService.logEvent(context.traceCtx, {
      eventType: 'AGENT_SPAWNED',
      actor: this.agentId,
      humanSummary: `Agent ${this.config.name} started for ${context.processType}`,
    });

    try {
      // 4. INITIALIZE
      this._context = context;
      await this.initialize(input, obligations, context);

      // 5. EXECUTE
      const output = await this.execute(input, obligations, constraints);

      // 6. STRICT GATE
      const validation = this.strictGate.validate(output, this.getOutputSchema());
      if (!validation.valid) {
        throw new Error(`Output validation failed: ${validation.errors.join(', ')}`);
      }

      // 7. COMPLIANCE (legacy validator — always runs for backward compatibility)
      const complianceCtx = {
        processType: context.processType,
        jurisdiction: context.jurisdiction,
        processInstanceId: context.processInstanceId,
        agentId: this.agentId,
      };
      const compliance = this.complianceValidator.validate(output, obligations, complianceCtx);

      // 7b. COMPLIANCE PIPELINE (if configured)
      let pipelineReport: ValidationReport | undefined;
      if (this.compliancePipeline) {
        pipelineReport = await this.compliancePipeline.validate(output, obligations, complianceCtx);

        await this.traceService.logEvent(context.traceCtx, {
          eventType: 'COMPLIANCE_PIPELINE_COMPLETED',
          actor: this.agentId,
          outputData: {
            pipelineStatus: pipelineReport.status,
            findingCount: pipelineReport.findings.length,
            severityCounts: pipelineReport.severityCounts,
            passedHardChecks: pipelineReport.passedHardChecks,
          },
        });
      }

      // 8. AGENT_COMPLETED
      await this.traceService.logEvent(context.traceCtx, {
        eventType: 'AGENT_COMPLETED',
        actor: this.agentId,
        outputData: { complianceSummary: compliance.summary, score: compliance.score },
        complianceAssertion: compliance.assertion as unknown as Record<string, unknown>,
      });

      return {
        success: true,
        data: validation.parsed as TOutput,
        confidence: this.calculateConfidence(output, compliance),
        compliance,
        qualification,
        pipelineReport,
        metrics: this.metrics.snapshot(),
        traceId: context.traceCtx.traceId,
        warnings: this.metrics.snapshot().warnings,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.traceService.logEvent(context.traceCtx, {
        eventType: 'AGENT_FAILED',
        actor: this.agentId,
        reasons: [message],
      });
      return {
        success: false,
        error: message,
        qualification,
        metrics: this.metrics.snapshot(),
        traceId: context.traceCtx.traceId,
      };
    } finally {
      await this.cleanup();
    }
  }

  // === Subclass hooks ===
  protected abstract execute(
    input: TInput,
    obligations: ObligationNode[],
    constraints: ConstraintNode[],
  ): Promise<TOutput>;
  protected abstract getRequiredObligations(): string[];
  protected abstract getOutputSchema(): ZodSchema<TOutput>;

  /** The active run context — set by the sealed lifecycle before initialize(). */
  protected _context: GroundedAgentContext | null = null;

  protected async initialize(_input: TInput, _obligations: ObligationNode[], _context?: GroundedAgentContext): Promise<void> {}
  protected async cleanup(): Promise<void> {}
  protected calculateConfidence(_output: TOutput, compliance: { score: number }): number {
    return compliance.score;
  }

  protected async loadConstraints(obligations: ObligationNode[]): Promise<ConstraintNode[]> {
    const all: ConstraintNode[] = [];
    for (const obl of obligations) {
      const cs = await this.graph.getConstraints(obl.obligationId);
      all.push(...cs);
    }
    return all;
  }

  // === LLM helpers (traced) ===
  protected async invokeLLM(
    params: {
      persona?: string;
      systemPrompt?: string;
      userPrompt: string;
      obligations?: ObligationNode[];
      fieldInstructions?: string[];
      fileContext?: FileContext[];
      skillContext?: SkillContext[];
      operation?: string;
      traceCtx: GroundedAgentContext['traceCtx'];
    },
  ): Promise<LLMCallResult<string>> {
    const composed = this.promptComposer.compose({
      persona: params.persona ?? this.config.persona,
      systemPrompt: params.systemPrompt ?? this.config.systemPrompt,
      obligationContext: params.obligations,
      fieldInstructions: params.fieldInstructions,
      fileContext: params.fileContext,
      skillContext: params.skillContext,
    });

    const request: LLMRequest = {
      messages: [
        { role: 'system', content: composed },
        { role: 'user', content: params.userPrompt },
      ],
    };

    await this.traceService.logEvent(params.traceCtx, {
      eventType: 'LLM_REQUEST_SENT',
      actor: this.agentId,
      decision: params.operation ?? 'llm.complete',
      inputData: { promptChars: composed.length + params.userPrompt.length },
    });

    const response = await this.llm.complete(request);
    this.metrics.recordLLMCall(response.usage.totalTokens, response.cost);

    await this.traceService.logEvent(params.traceCtx, {
      eventType: 'LLM_RESPONSE_RECEIVED',
      actor: this.agentId,
      outputData: { model: response.model, tokens: response.usage.totalTokens, cost: response.cost },
    });

    return { content: response.content, response };
  }

  protected async invokeLLMForJSON<T>(
    params: {
      persona?: string;
      systemPrompt?: string;
      userPrompt: string;
      schema: ZodSchema<T>;
      obligations?: ObligationNode[];
      fieldInstructions?: string[];
      fileContext?: FileContext[];
      skillContext?: SkillContext[];
      operation?: string;
      traceCtx: GroundedAgentContext['traceCtx'];
    },
  ): Promise<LLMCallResult<T>> {
    const composed = this.promptComposer.compose({
      persona: params.persona ?? this.config.persona,
      systemPrompt: params.systemPrompt ?? this.config.systemPrompt,
      obligationContext: params.obligations,
      fieldInstructions: params.fieldInstructions,
      fileContext: params.fileContext,
      skillContext: params.skillContext,
    });
    const request: LLMRequest = {
      messages: [
        { role: 'system', content: composed },
        { role: 'user', content: params.userPrompt },
      ],
    };

    await this.traceService.logEvent(params.traceCtx, {
      eventType: 'LLM_REQUEST_SENT',
      actor: this.agentId,
      decision: params.operation ?? 'llm.completeJSON',
    });

    const parsed = await this.llm.completeJSON(request, params.schema, { structuredOutput: true });
    // We don't have token counts here without re-calling, so log a synthetic event.
    await this.traceService.logEvent(params.traceCtx, {
      eventType: 'LLM_RESPONSE_RECEIVED',
      actor: this.agentId,
      outputData: { format: 'json' },
    });

    return {
      content: parsed,
      response: {
        content: JSON.stringify(parsed),
        model: 'negotiated',
        provider: 'negotiated',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: 0,
        finishReason: 'stop',
      },
    };
  }
}
