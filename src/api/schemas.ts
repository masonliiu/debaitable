import { z } from "zod"
import {
  DecisionInputSchema,
  DecisionSchema,
  DecisionRecordSchema,
  DecisionRunSchema,
  DecisionStatusSchema,
  DebateRoundSchema,
  VisibilitySchema,
} from "../core"

export const CreateDecisionRequestSchema = z.object({
  input: DecisionInputSchema,
  visibility: VisibilitySchema.optional(),
})

export const CreateDecisionResponseSchema = z.object({
  decisionId: z.string().min(1),
  runId: z.string().min(1),
  status: DecisionStatusSchema,
})

export const GetDecisionResponseSchema = z.object({
  decision: DecisionSchema,
  record: DecisionRecordSchema.nullable(),
  rounds: z.array(DebateRoundSchema),
  runs: z.array(DecisionRunSchema),
})

export const ErrorResponseSchema = z.object({
  error: z.string().min(1),
  code: z.enum(["bad_request", "not_found", "internal_error"]),
})
