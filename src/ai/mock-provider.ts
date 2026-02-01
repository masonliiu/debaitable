import { LlmProvider, LlmRequest, LlmResponse } from "./types"

export class StaticLlmProvider implements LlmProvider {
  private responses: LlmResponse<unknown>[]

  constructor(responses: LlmResponse<unknown>[]) {
    this.responses = [...responses]
  }

  async generate<TSchema, TOutput>(
    _request: LlmRequest<TSchema>
  ): Promise<LlmResponse<TOutput>> {
    const next = this.responses.shift()
    if (!next) {
      throw new Error("StaticLlmProvider: no responses left")
    }
    return next as LlmResponse<TOutput>
  }
}
