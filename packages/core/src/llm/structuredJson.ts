/**
 * Schema-aware structured JSON generation.
 *
 * Every provider's `completeJSON` routes through this. It does three things
 * the naive "respond with JSON" prompt never did:
 *
 *   1. Tells the model the EXACT shape it must return by inlining the JSON
 *      Schema derived from the caller's Zod schema. Without this the model
 *      guesses field names and validation fails.
 *   2. Tolerantly extracts the JSON object even if the model wraps it in
 *      prose or code fences.
 *   3. Retries with the validation errors fed back, so a near-miss is
 *      corrected instead of discarded. There is no silent fallback — if the
 *      model cannot produce conforming JSON after every attempt, we throw,
 *      and the caller surfaces an honest error.
 */

import type { ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { LLMMessage, LLMRequest, LLMResponse } from './types.js';

export interface StructuredJsonOptions {
  /** How many times to ask the model before giving up. Default 3. */
  maxAttempts?: number;
  /** Token budget per attempt. Falls back to the request, then 4096. */
  maxTokens?: number;
}

/**
 * Drive a provider's `complete` toward a value that satisfies `schema`.
 * Throws a descriptive error if no attempt validates.
 */
export async function generateStructuredJson<T>(
  complete: (req: LLMRequest) => Promise<LLMResponse>,
  request: LLMRequest,
  schema: ZodSchema<T>,
  opts: StructuredJsonOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const maxTokens = opts.maxTokens ?? request.maxTokens ?? 4096;

  const jsonSchema = zodToJsonSchema(schema, { target: 'jsonSchema7', $refStrategy: 'none' });
  const schemaText = JSON.stringify(jsonSchema, null, 2);

  const schemaInstruction: LLMMessage = {
    role: 'system',
    content:
      'You MUST respond with a SINGLE JSON object only — no markdown, no code fences, no commentary ' +
      'before or after. The object must strictly conform to this JSON Schema:\n\n' +
      schemaText +
      '\n\nEvery required property must be present and correctly typed. Do not invent properties that ' +
      'are not in the schema. Populate every field with substantive, case-specific content.',
  };

  let lastError = 'No attempts made.';
  let lastRaw = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const messages: LLMMessage[] = [...request.messages, schemaInstruction];
    if (attempt > 1) {
      // Keep roles alternating (Anthropic requires it): echo the prior output
      // as an assistant turn, then correct it as a user turn.
      messages.push({ role: 'assistant', content: lastRaw.slice(0, 4000) || '{}' });
      messages.push({
        role: 'user',
        content:
          'That response did not validate against the schema.\n\n' +
          `Validation errors:\n${lastError}\n\n` +
          'Return ONLY a corrected JSON object that fixes every error above and conforms exactly to the schema.',
      });
    }

    const res = await complete({ ...request, messages, maxTokens });
    lastRaw = res.content ?? '';
    const candidate = extractJson(lastRaw);
    if (candidate === null) {
      lastError = 'Response could not be parsed as JSON.';
      continue;
    }
    const parsed = schema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    lastError = parsed.error.issues
      .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
  }

  throw new Error(
    `LLM could not produce schema-valid JSON after ${maxAttempts} attempt(s). Last validation errors:\n${lastError}`,
  );
}

/** Best-effort extraction of a JSON value from a model response. */
function extractJson(text: string): unknown | null {
  let t = text.trim();
  // Strip a leading/trailing code fence if present.
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  // Fast path: the whole thing is JSON.
  try {
    return JSON.parse(t);
  } catch {
    /* fall through to slice strategy */
  }

  // Slice between the first opening and last matching closing delimiter,
  // handling prose that brackets the JSON.
  const firstBrace = t.indexOf('{');
  const firstBracket = t.indexOf('[');
  if (firstBrace === -1 && firstBracket === -1) return null;

  let start: number;
  let endChar: string;
  if (firstBracket === -1 || (firstBrace !== -1 && firstBrace < firstBracket)) {
    start = firstBrace;
    endChar = '}';
  } else {
    start = firstBracket;
    endChar = ']';
  }
  const end = t.lastIndexOf(endChar);
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}
