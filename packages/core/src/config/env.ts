import { z } from "zod";

/**
 * Comma-separated string → string array transform.
 * Empty string yields an empty array.
 */
const commaSeparatedList = z
  .string()
  .optional()
  .transform((val) => {
    if (!val || val.trim() === "") return [];
    return val.split(",").map((s) => s.trim()).filter(Boolean);
  });

/**
 * Boolean-ish env var: accepts "true", "1", "yes" (case-insensitive) as true.
 */
const booleanish = z
  .string()
  .optional()
  .transform((val) => {
    if (!val) return false;
    return ["true", "1", "yes"].includes(val.toLowerCase());
  });

const isTest = process.env["NODE_ENV"] === "test" || process.env["VITEST"] === "true";

/**
 * Core schema — all environment variables consumed across the monorepo.
 *
 * Required vars will cause a hard failure at startup when missing,
 * except in test environments where DATABASE_URL and NEO4J_* are relaxed.
 */
const envSchema = z.object({
  // ── PostgreSQL ──────────────────────────────────────────────────────
  DATABASE_URL: isTest
    ? z.string().optional().default("postgresql://test:test@localhost:5432/test")
    : z.string().min(1, "DATABASE_URL is required"),

  // ── Neo4j ───────────────────────────────────────────────────────────
  NEO4J_URI: isTest
    ? z.string().optional().default("bolt://localhost:7687")
    : z.string().min(1, "NEO4J_URI is required"),
  NEO4J_USER: isTest
    ? z.string().optional().default("neo4j")
    : z.string().min(1, "NEO4J_USER is required"),
  NEO4J_PASSWORD: isTest
    ? z.string().optional().default("test")
    : z.string().min(1, "NEO4J_PASSWORD is required"),
  NEO4J_DATABASE: z.string().optional().default("neo4j"),

  // ── API ─────────────────────────────────────────────────────────────
  API_PORT: z
    .string()
    .optional()
    .default("4000")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),
  API_HOST: z.string().optional().default("0.0.0.0"),
  JWT_SECRET: isTest
    ? z.string().optional().default("test-jwt-secret")
    : z.string().min(1, "JWT_SECRET is required"),
  JWT_SECRET_PREVIOUS: z.string().optional(),

  // ── Auth (Clerk) ────────────────────────────────────────────────────
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),

  // ── CORS / Security ─────────────────────────────────────────────────
  ALLOWED_ORIGINS: commaSeparatedList,
  AUTH_BYPASS_DEV: booleanish,

  // ── Web ─────────────────────────────────────────────────────────────
  VITE_API_URL: z.string().optional(),

  // ── LLM Providers ──────────────────────────────────────────────────
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  ENABLE_LLM_CROSS_CHECK: booleanish,

  // ── MCP Server ──────────────────────────────────────────────────────
  MCP_TRANSPORT: z.enum(["stdio", "http"]).optional(),
  MCP_PORT: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  MCP_MAX_RESPONSE_BYTES: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().optional()),

  // ── Caching ─────────────────────────────────────────────────────────
  REDIS_URL: z.string().optional(),

  // ── Observability ───────────────────────────────────────────────────
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

  // ── Runtime ─────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .optional()
    .default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .optional()
    .default("info"),
});

/** Inferred TypeScript type for the validated environment. */
export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate `process.env` against the schema.
 * Throws a descriptive error on the first invocation if required vars are missing.
 */
export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Environment validation failed:\n${formatted}\n\nCheck your .env file or environment variables.`
    );
  }

  return result.data;
}

/**
 * Singleton validated environment.
 * Import this for convenient access: `import { env } from '@regground/core/config/env'`
 */
export const env: Env = loadEnv();

export default env;
