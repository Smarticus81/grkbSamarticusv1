/**
 * Capability-based, provider-agnostic embedding client.
 *
 * Mirrors the existing LLM provider pattern: pick a provider based on
 * available API keys, batch requests, retry on transient failures,
 * and never log secrets.
 */

export interface EmbeddingProviderConfig {
  /** Provider name for logging/tagging. */
  name: string;
  /** API endpoint for the embedding call. */
  endpoint: string;
  /** API key (never logged). */
  apiKey: string;
  /** Model identifier (e.g. 'text-embedding-3-large'). */
  model: string;
  /** Dimensionality of the output vectors. */
  dimensions: number;
  /** Max texts per single API call. */
  maxBatchSize: number;
  /** Build the fetch headers (default: Bearer auth). */
  buildHeaders?: (apiKey: string) => Record<string, string>;
  /** Build the request body. */
  buildBody?: (texts: string[], model: string, dimensions: number) => unknown;
  /** Extract vectors from the response JSON. */
  parseResponse?: (json: unknown) => number[][];
  /** Minimum delay between consecutive requests (ms) to stay under rate limits. */
  minRequestIntervalMs?: number;
}

export interface EmbeddingResult {
  /** The embedding vectors, one per input text, in the same order. */
  vectors: number[][];
  /** Model used to generate the embeddings. */
  model: string;
  /** Provider used. */
  provider: string;
  /** Total tokens consumed (if reported by the API). */
  totalTokens?: number;
}

const DEFAULT_MAX_RETRIES = 6;
const RETRY_BASE_MS = 1000;

/**
 * Provider-agnostic embedding client with batch + retry.
 *
 * Usage:
 * ```ts
 * const client = EmbeddingClient.fromEnv();
 * const { vectors } = await client.embed(['post-market surveillance plan']);
 * ```
 */
export class EmbeddingClient {
  constructor(private readonly provider: EmbeddingProviderConfig) {}

  // ── Factory ──────────────────────────────────────────────────────────

  /**
   * Build an EmbeddingClient from environment variables.
   *
   * Provider precedence:
   *   1. `EMBEDDING_PROVIDER` (openai | google) if set and its key is available.
   *   2. OpenAI text-embedding-3-large (3072 dims) if `OPENAI_API_KEY` is set.
   *   3. Google text-embedding-004 (768 dims) if `GOOGLE_API_KEY` is set.
   *
   * IMPORTANT: index-time and query-time embeddings must use the SAME provider
   * (vector dimensions are baked into the Neo4j index). Pin the choice with
   * `EMBEDDING_PROVIDER` so every process resolves to the same model.
   */
  static fromEnv(): EmbeddingClient {
    const explicit = process.env.EMBEDDING_PROVIDER?.trim().toLowerCase();
    const openaiKey = process.env.OPENAI_API_KEY;
    const googleKey = process.env.GOOGLE_API_KEY;

    if (explicit === 'openai') {
      if (!openaiKey) throw new Error('EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set.');
      return new EmbeddingClient(EmbeddingClient.openai(openaiKey));
    }
    if (explicit === 'google') {
      if (!googleKey) throw new Error('EMBEDDING_PROVIDER=google but GOOGLE_API_KEY is not set.');
      return new EmbeddingClient(EmbeddingClient.google(googleKey));
    }
    if (explicit && explicit !== 'openai' && explicit !== 'google') {
      throw new Error(`Unknown EMBEDDING_PROVIDER "${explicit}". Use "openai" or "google".`);
    }

    if (openaiKey) {
      return new EmbeddingClient(EmbeddingClient.openai(openaiKey));
    }
    if (googleKey) {
      return new EmbeddingClient(EmbeddingClient.google(googleKey));
    }
    throw new Error(
      'No embedding provider available. Set OPENAI_API_KEY or GOOGLE_API_KEY.',
    );
  }

  /** OpenAI text-embedding-3-large config (3072 dims, cosine). */
  static openai(
    apiKey: string,
    model = 'text-embedding-3-large',
    dimensions = 3072,
  ): EmbeddingProviderConfig {
    return {
      name: 'openai',
      endpoint: 'https://api.openai.com/v1/embeddings',
      apiKey,
      model,
      dimensions,
      maxBatchSize: 2048,
      buildHeaders: (key) => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      }),
      buildBody: (texts, m, dims) => ({
        input: texts,
        model: m,
        dimensions: dims,
        encoding_format: 'float',
      }),
      parseResponse: (json: any) => {
        const data = json?.data as { embedding: number[]; index: number }[];
        return data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
      },
    };
  }

  /**
   * Google gemini-embedding-001 config (3072 dims, cosine).
   *
   * gemini-embedding-001 exposes the singular `embedContent` method (not the
   * deprecated synchronous `batchEmbedContents`), so this provider sends one
   * text per request (maxBatchSize = 1). Output is L2-normalized at 3072 dims.
   */
  static google(
    apiKey: string,
    model = 'gemini-embedding-001',
    dimensions = 3072,
  ): EmbeddingProviderConfig {
    return {
      name: 'google',
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
      apiKey,
      model,
      dimensions,
      maxBatchSize: 1,
      // gemini-embedding-001 free tier is ~100 req/min; pace just under that.
      minRequestIntervalMs: 700,
      buildHeaders: (key) => ({
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      }),
      buildBody: (texts, m, dims) => ({
        model: `models/${m}`,
        content: { parts: [{ text: texts[0] ?? '' }] },
        outputDimensionality: dims,
      }),
      parseResponse: (json: any) => {
        const values = json?.embedding?.values as number[] | undefined;
        return values ? [values] : [];
      },
    };
  }

  // ── Public API ───────────────────────────────────────────────────────

  /** Embed one or more texts. Automatically batches if needed. */
  async embed(
    texts: string[],
    maxRetries = DEFAULT_MAX_RETRIES,
  ): Promise<EmbeddingResult> {
    if (texts.length === 0) {
      return { vectors: [], model: this.provider.model, provider: this.provider.name };
    }

    const batches = this.chunk(texts, this.provider.maxBatchSize);
    const allVectors: number[][] = [];
    let totalTokens = 0;
    const pace = this.provider.minRequestIntervalMs ?? 0;

    for (let i = 0; i < batches.length; i++) {
      if (i > 0 && pace > 0) await this.sleep(pace);
      const result = await this.embedBatch(batches[i]!, maxRetries);
      allVectors.push(...result.vectors);
      totalTokens += result.tokens;
    }

    return {
      vectors: allVectors,
      model: this.provider.model,
      provider: this.provider.name,
      totalTokens,
    };
  }

  /** Embed a single text string. Convenience wrapper. */
  async embedOne(text: string, maxRetries = DEFAULT_MAX_RETRIES): Promise<number[]> {
    const result = await this.embed([text], maxRetries);
    return result.vectors[0]!;
  }

  /** The dimensionality of vectors produced by this client. */
  get dimensions(): number {
    return this.provider.dimensions;
  }

  /** The model name this client uses. */
  get model(): string {
    return this.provider.model;
  }

  /** The provider name. */
  get providerName(): string {
    return this.provider.name;
  }

  // ── Internals ────────────────────────────────────────────────────────

  private async embedBatch(
    texts: string[],
    maxRetries: number,
  ): Promise<{ vectors: number[][]; tokens: number }> {
    const headers =
      this.provider.buildHeaders?.(this.provider.apiKey) ?? {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.provider.apiKey}`,
      };
    const body =
      this.provider.buildBody?.(texts, this.provider.model, this.provider.dimensions) ?? {
        input: texts,
        model: this.provider.model,
      };

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(this.provider.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          // Rate limit / transient server error → retry with backoff.
          // Honor a Retry-After header (seconds) when the provider sends one.
          if (res.status === 429 || res.status >= 500) {
            lastError = new Error(
              `Embedding API ${res.status}: ${errText.slice(0, 200)}`,
            );
            const retryAfter = Number(res.headers.get('retry-after'));
            const waitMs =
              Number.isFinite(retryAfter) && retryAfter > 0
                ? retryAfter * 1000
                : RETRY_BASE_MS * Math.pow(2, attempt);
            await this.sleep(waitMs);
            continue;
          }
          throw new Error(
            `Embedding API ${res.status}: ${errText.slice(0, 500)}`,
          );
        }

        const json = await res.json();
        const vectors =
          this.provider.parseResponse?.(json) ??
          (json as any).data?.map((d: any) => d.embedding) ?? [];

        const tokens = (json as any)?.usage?.total_tokens ?? 0;
        return { vectors, tokens };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries - 1) {
          await this.sleep(RETRY_BASE_MS * Math.pow(2, attempt));
        }
      }
    }

    throw lastError ?? new Error('Embedding failed after retries');
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
