import { LlmRequestSchema, LlmResponseSchema } from "./schemas"

export const parseLlmRequest = (value: unknown) =>
  LlmRequestSchema.parse(value)

export const parseLlmResponse = (value: unknown) =>
  LlmResponseSchema.parse(value)
