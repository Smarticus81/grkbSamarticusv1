import { z } from 'zod';

// === Schema field definition (portable, JSON-safe) ===
export const FieldTypeSchema = z.enum(['string', 'number', 'boolean', 'array', 'object']);

export const FieldDefinitionSchema = z.object({
  type: FieldTypeSchema,
  required: z.boolean().default(true),
  description: z.string().optional(),
  items: z.lazy((): z.ZodType => FieldDefinitionSchema).optional(),
});
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;

export const SchemaDefinitionSchema = z.record(z.string(), FieldDefinitionSchema);
export type SchemaDefinition = z.infer<typeof SchemaDefinitionSchema>;

// === Agent configuration ===
export const AgentConfigSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(128),
  description: z.string().max(1024).default(''),
  version: z.string().default('1.0.0'),
  task: z.string().min(1).max(128),
  processTypes: z.array(z.string().min(1)).default([]),
  jurisdictions: z.array(z.string().min(1)).default(['GLOBAL']),
  persona: z.string().default(''),
  systemPrompt: z.string().default(''),
  inputSchema: SchemaDefinitionSchema.default({}),
  outputSchema: SchemaDefinitionSchema.default({}),
  attachedFileIds: z.array(z.string()).default([]),
  attachedSkillIds: z.array(z.string()).default([]),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// === Create / Update partials ===
export const CreateAgentConfigSchema = AgentConfigSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateAgentConfig = z.infer<typeof CreateAgentConfigSchema>;

// === Runtime schema conversion ===

/**
 * Convert a portable SchemaDefinition into a runtime Zod schema.
 * Used to validate agent inputs/outputs dynamically.
 */
export function schemaToZod(def: SchemaDefinition): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(def)) {
    let base: z.ZodTypeAny;
    switch (field.type) {
      case 'string':
        base = z.string();
        break;
      case 'number':
        base = z.number();
        break;
      case 'boolean':
        base = z.boolean();
        break;
      case 'array':
        if (field.items) {
          base = z.array(fieldToZod(field.items));
        } else {
          base = z.array(z.unknown());
        }
        break;
      case 'object':
        base = z.record(z.unknown());
        break;
    }
    shape[key] = field.required ? base : base.optional();
  }
  return z.object(shape);
}

function fieldToZod(field: FieldDefinition): z.ZodTypeAny {
  switch (field.type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      return field.items ? z.array(fieldToZod(field.items)) : z.array(z.unknown());
    case 'object':
      return z.record(z.unknown());
  }
}