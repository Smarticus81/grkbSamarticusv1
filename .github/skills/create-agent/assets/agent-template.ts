import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type GroundedAgentConfig,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

const InputSchema = z.object({
  triggerId: z.string(),
});

const OutputSchema = z.object({
  result: z.string(),
  addressedObligations: z.array(z.string()),
});

export type Input = z.infer<typeof InputSchema>;
export type Output = z.infer<typeof OutputSchema>;

export class NewAgent extends BaseGroundedAgent<Input, Output> {
  constructor(deps: BaseGroundedAgentDeps) {
    const config: GroundedAgentConfig = {
      name: 'NewAgent',
      description: 'Describe what this agent does',
      version: '1.0.0',
      persona: 'You are a regulated QMS specialist.',
      systemPrompt: 'Describe the agent mission here.',
      processTypes: ['TODO'],
      requiredObligations: ['TODO.OBL.001'],
    };
    super(config, deps);
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }

  protected getOutputSchema() {
    return OutputSchema;
  }

  protected async execute(
    input: Input,
    obligations: ObligationNode[],
    _constraints: ConstraintNode[],
  ): Promise<Output> {
    const { content } = await this.invokeLLMForJSON({
      userPrompt: `Process trigger ${input.triggerId}.`,
      schema: OutputSchema,
      obligations,
      operation: 'NewAgent.execute',
      traceCtx: { processInstanceId: 'pi', traceId: 'trace' },
    });
    return content;
  }
}
