import { z } from "zod"

export const DecisionJobPayloadSchema = z.object({
  decisionId: z.string().min(1),
  runId: z.string().min(1),
})
