export type LlmRequest<TSchema> = {
  system: string
  prompt: string
  schema: TSchema
}

export type LlmResponse<TOutput> = {
  output: TOutput
  raw: string
  model: string
}

export type LlmProvider = {
  generate: <TSchema, TOutput>(
    request: LlmRequest<TSchema>
  ) => Promise<LlmResponse<TOutput>>
}
