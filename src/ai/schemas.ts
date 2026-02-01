import { z } from "zod"

export const LlmRequestSchema = z.object({
  system: z.string().min(1),
  prompt: z.string().min(1),
  schema: z.unknown(),
})

export const LlmResponseSchema = z.object({
  output: z.unknown(),
  raw: z.string().min(1),
  model: z.string().min(1),
})
