import type { ZodSchema } from 'zod';
import { z } from 'zod';
import { BaseGroundedAgent, type BaseGroundedAgentDeps } from './BaseGroundedAgent.js';
import type { ObligationNode, ConstraintNode } from '../graph/types.js';
import { type AgentConfig, schemaToZod } from './AgentConfig.js';
import type { FileStore } from '../evidence/FileStore.js';
import type { SkillStore } from '../skills/SkillStore.js';
import type { FileContext, SkillContext } from './PromptComposer.js';

/**
 * Output always includes addressedObligations as mandated by the agent instructions.
 */
interface DynamicOutput {
  [key: string]: unknown;
  addressedObligations: string[];
}

/**
 * Universal grounded agent driven by an AgentConfig + LLM.
 *
 * Instead of hand-written TypeScript logic per agent, this agent:
 * 1. Takes a portable AgentConfig (name, persona, systemPrompt, input/output schemas)
 * 2. Receives auto-discovered obligation IDs at construction time
 * 3. Calls the LLM with obligation context injected into the prompt
 * 4. Validates output against the config's output schema (converted to Zod at runtime)
 *
 * The sealed BaseGroundedAgent lifecycle (qualify → execute → validate → trace)
 * still governs everything — this class just makes `execute()` LLM-driven.
 */
export class DynamicGroundedAgent extends BaseGroundedAgent<
  Record<string, unknown>,
  DynamicOutput
> {
  private readonly agentConfig: AgentConfig;
  private readonly discoveredObligationIds: string[];
  private readonly outputZodSchema: ZodSchema<DynamicOutput>;
  private readonly fileStore?: FileStore;
  private readonly skillStore?: SkillStore;

  constructor(
    agentConfig: AgentConfig,
    discoveredObligationIds: string[],
    deps: BaseGroundedAgentDeps,
    stores?: { fileStore?: FileStore; skillStore?: SkillStore },
  ) {
    super(
      {
        name: agentConfig.name,
        description: agentConfig.description,
        version: agentConfig.version,
        persona: agentConfig.persona,
        systemPrompt: agentConfig.systemPrompt,
        processTypes: agentConfig.processTypes,
        requiredObligations: discoveredObligationIds,
      },
      deps,
    );
    this.agentConfig = agentConfig;
    this.discoveredObligationIds = discoveredObligationIds;
    this.fileStore = stores?.fileStore;
    this.skillStore = stores?.skillStore;

    // Build runtime Zod schema from the config's output definition + mandatory addressedObligations
    const configOutputSchema = schemaToZod(agentConfig.outputSchema);
    this.outputZodSchema = configOutputSchema.extend({
      addressedObligations: z.array(z.string()),
    }) as unknown as ZodSchema<DynamicOutput>;
  }

  protected getRequiredObligations(): string[] {
    return this.discoveredObligationIds;
  }

  protected getOutputSchema(): ZodSchema<DynamicOutput> {
    return this.outputZodSchema;
  }

  protected async execute(
    input: Record<string, unknown>,
    obligations: ObligationNode[],
    constraints: ConstraintNode[],
  ): Promise<DynamicOutput> {
    const traceCtx = this._context!.traceCtx;

    // Build field instructions from constraints
    const fieldInstructions: string[] = [];
    for (const c of constraints) {
      fieldInstructions.push(`CONSTRAINT [${c.constraintId}]: ${c.text}`);
    }

    // Resolve attached files
    let fileContext: FileContext[] | undefined;
    if (this.fileStore && this.agentConfig.attachedFileIds.length > 0) {
      const files = await this.fileStore.getMultipleByFileIds(this.agentConfig.attachedFileIds);
      fileContext = files.map((f) => ({
        fileId: f.fileId,
        name: f.name,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
      }));
    }

    // Resolve attached skills
    let skillContext: SkillContext[] | undefined;
    if (this.skillStore && this.agentConfig.attachedSkillIds.length > 0) {
      const resolved = await this.skillStore.resolveSkills(this.agentConfig.attachedSkillIds);
      skillContext = resolved.map((r) => ({
        skillName: r.skill.name,
        instructions: r.version.definition.instructions,
        triggers: r.version.definition.triggers,
      }));
    }

    // Describe the expected output shape so the LLM knows what to produce
    const outputFields = Object.entries(this.agentConfig.outputSchema)
      .map(([key, field]) => {
        const req = field.required ? 'required' : 'optional';
        const desc = field.description ? ` — ${field.description}` : '';
        return `  ${key}: ${field.type} (${req})${desc}`;
      })
      .join('\n');

    fieldInstructions.push(
      `Your response MUST be valid JSON matching this schema:\n${outputFields}\n  addressedObligations: array of obligation IDs you addressed (required)`,
    );

    // Build the user prompt from the input data
    const userPrompt = `Process the following input and produce the required JSON output.\n\nINPUT:\n${JSON.stringify(input, null, 2)}`;

    const result = await this.invokeLLMForJSON<DynamicOutput>({
      userPrompt,
      schema: this.outputZodSchema,
      obligations,
      fieldInstructions,
      fileContext,
      skillContext,
      operation: `dynamic.${this.agentConfig.task}`,
      traceCtx,
    });

    return result.content;
  }
}
