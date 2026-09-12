import { LlmProvider, LlmRequest, LlmResponse } from "./types"

export type RetryOptions = {
  /** Maximum number of attempts (including the first). Defaults to 3. */
  maxAttempts?: number
  /** Base delay in milliseconds between attempts. Defaults to 200. */
  delayMs?: number
  /** Multiplier applied to delayMs after each failure (exponential backoff). Defaults to 2. */
  backoffFactor?: number
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * RetryProvider wraps any LlmProvider and retries failed generate() calls
 * with exponential backoff up to a configurable maximum number of attempts.
 */
export class RetryProvider implements LlmProvider {
  private readonly inner: LlmProvider
  private readonly maxAttempts: number
  private readonly delayMs: number
  private readonly backoffFactor: number

  constructor(inner: LlmProvider, options: RetryOptions = {}) {
    this.inner = inner
    this.maxAttempts = options.maxAttempts ?? 3
    this.delayMs = options.delayMs ?? 200
    this.backoffFactor = options.backoffFactor ?? 2
  }

  async generate<TSchema, TOutput>(
    request: LlmRequest<TSchema>
  ): Promise<LlmResponse<TOutput>> {
    let lastError: unknown
    let delay = this.delayMs
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await this.inner.generate<TSchema, TOutput>(request)
      } catch (err) {
        lastError = err
        if (attempt < this.maxAttempts) {
          await sleep(delay)
          delay = delay * this.backoffFactor
        }
      }
    }
    throw lastError
  }
}

export const createRetryProvider = (
  inner: LlmProvider,
  options?: RetryOptions
): LlmProvider => new RetryProvider(inner, options)
