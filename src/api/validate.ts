import {
  CreateDecisionRequestSchema,
  CreateDecisionResponseSchema,
  ErrorResponseSchema,
  GetDecisionResponseSchema,
} from "./schemas"
import {
  CreateDecisionRequest,
  CreateDecisionResponse,
  ErrorResponse,
  GetDecisionResponse,
} from "./types"

export const parseCreateDecisionRequest = (
  value: unknown
): CreateDecisionRequest => CreateDecisionRequestSchema.parse(value)

export const parseCreateDecisionResponse = (
  value: unknown
): CreateDecisionResponse => CreateDecisionResponseSchema.parse(value)

export const parseGetDecisionResponse = (value: unknown): GetDecisionResponse =>
  GetDecisionResponseSchema.parse(value)

export const parseErrorResponse = (value: unknown): ErrorResponse =>
  ErrorResponseSchema.parse(value)
