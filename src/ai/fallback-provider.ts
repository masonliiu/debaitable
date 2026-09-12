import { LlmProvider, LlmRequest, LlmResponse } from "./types"

/**
 * FallbackProvider tries each provider in order, moving to the next on failure.
 * If all providers fail, it throws an aggregated error.
 */
export class FallbackProvider implements LlmProvider {
  private readonly providers: LlmProvider[]

  constructor(providers: LlmProvider[]) {
    if (providers.length === 0) {
      throw new RangeError("FallbackProvider requires at least one provider")
    }
    this.providers = providers
  }

  async generate<TSchema, TOutput>(
    request: LlmRequest<TSchema>
  ): Promise<LlmResponse<TOutput>> {
    const errors: unknown[] = []
    for (const provider of this.providers) {
      try {
        return await provider.generate<TSchema, TOutput>(request)
      } catch (err) {
        errors.push(err)
      }
    }
    const messages = errors
      .map((e, i) => `provider[${i}]: ${e instanceof Error ? e.message : String(e)}`)
      .join("; ")
    throw new Error(`All fallback providers failed: ${messages}`)
  }
}

export const createFallbackProvider = (providers: LlmProvider[]): LlmProvider =>
  new FallbackProvider(providers)
