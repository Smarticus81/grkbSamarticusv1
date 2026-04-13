import type { ZodSchema } from 'zod';
import type { StrictGateResult } from './types.js';

/**
 * Schema enforcement for all agent and step I/O. Wraps Zod with a uniform
 * result shape so guardrails can be composed.
 */
export class StrictGate {
  validate<T>(value: unknown, schema: ZodSchema<T>): StrictGateResult {
    const parsed = schema.safeParse(value);
    if (parsed.success) {
      return { valid: true, errors: [], parsed: parsed.data };
    }
    return {
      valid: false,
      errors: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    };
  }

  enforce<T>(value: unknown, schema: ZodSchema<T>): T {
    const result = this.validate(value, schema);
    if (!result.valid) {
      throw new Error(`StrictGate validation failed: ${result.errors.join('; ')}`);
    }
    return result.parsed as T;
  }
}
