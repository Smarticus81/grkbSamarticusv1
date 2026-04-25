import { randomUUID } from 'node:crypto';
import type {
  AgentRegistry,
  BaseGroundedAgentDeps,
  GroundedAgentContext,
  GroundedAgentResult,
} from '@regground/core';
import { ProcessStateMachine } from './ProcessStateMachine.js';
import { SSEStream } from './SSEStream.js';
import type { SandboxRunInput, SandboxRunResult } from './types.js';

/**
 * Executes a process instance in the sandbox by walking its step DAG and
 * running the bound agents through their sealed lifecycle.
 */
export class SandboxRunner {
  readonly stream = new SSEStream();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly deps: BaseGroundedAgentDeps,
  ) {}

  async run(input: SandboxRunInput): Promise<SandboxRunResult> {
    const processInstanceId = randomUUID();
    this.stream.publish({ type: 'process.started', processInstanceId });

    const traceCtx = await this.deps.traceService.startTrace(processInstanceId, input.tenantId, input.workspaceId);
    const baseContext: GroundedAgentContext = {
      processInstanceId,
      workspaceId: input.workspaceId,
      processType: input.definition.requiredAgentTypes[0] ?? input.definition.name,
      jurisdiction: input.jurisdiction,
      availableEvidenceTypes: input.availableEvidenceTypes,
      traceCtx,
    };

    const sm = new ProcessStateMachine(input.definition);
    const stepResults: Record<string, GroundedAgentResult<any>> = {};
    const failedSteps: string[] = [];

    while (!sm.isDone()) {
      const ready = sm.next();
      if (ready.length === 0) break;
      for (const step of ready) {
        this.stream.publish({ type: 'step.started', stepId: step.id });
        try {
          const reg = this.registry.get(step.agentType);
          if (!reg) throw new Error(`Agent not registered: ${step.agentType}`);
          const agent = reg.factory();
          // The agent constructor inside the factory must accept the deps; the
          // factory is the unit-of-injection. Most factories close over deps.
          const result = await agent.run(input.input, baseContext);
          stepResults[step.id] = result;
          if (!result.success) {
            failedSteps.push(step.id);
            this.stream.publish({ type: 'step.completed', stepId: step.id, success: false });
            break;
          }
          this.stream.publish({ type: 'step.completed', stepId: step.id, success: true });
          sm.markComplete(step.id);
        } catch (e: any) {
          failedSteps.push(step.id);
          this.stream.publish({ type: 'error', message: `${step.id}: ${e.message}` });
          break;
        }
      }
      if (failedSteps.length > 0) break;
    }

    const status: SandboxRunResult['status'] =
      failedSteps.length > 0 ? 'failed' : sm.isDone() ? 'completed' : 'paused_at_gate';
    this.stream.publish({ type: 'process.completed', processInstanceId, status });
    return { processInstanceId, status, stepResults, failedSteps };
  }
}
