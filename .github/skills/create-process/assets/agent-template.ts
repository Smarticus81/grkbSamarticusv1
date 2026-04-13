import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type GroundedAgentConfig,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

const InputSchema = z.object({
  // TODO: define the agent input
});

const OutputSchema = z.object({
  // TODO: define the agent output
  addressedObligations: z.array(z.string()),
});

export type Input = z.infer<typeof InputSchema>;
export type Output = z.infer<typeof OutputSchema>;

export class TemplateAgent extends BaseGroundedAgent<Input, Output> {
  constructor(deps: BaseGroundedAgentDeps) {
    const config: GroundedAgentConfig = {
      name: 'TemplateAgent',
      description: 'TODO',
      version: '1.0.0',
      persona: 'TODO',
      systemPrompt: 'TODO',
      processTypes: ['TODO'],
      requiredObligations: [],
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
    _input: Input,
    _obligations: ObligationNode[],
    _constraints: ConstraintNode[],
  ): Promise<Output> {
    // TODO: implement the agent's work via this.invokeLLM* helpers.
    return { addressedObligations: [] };
  }
}
