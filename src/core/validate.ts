import {
  DebateRoundSchema,
  DecisionInputSchema,
  DecisionRecordSchema,
  DecisionRunSchema,
  DecisionSchema,
} from "./schemas"
import {
  DebateRound,
  Decision,
  DecisionInput,
  DecisionRecord,
  DecisionRun,
} from "./types"

export const parseDecisionInput = (value: unknown): DecisionInput =>
  DecisionInputSchema.parse(value)

export const parseDecision = (value: unknown): Decision =>
  DecisionSchema.parse(value)

export const parseDecisionRecord = (value: unknown): DecisionRecord =>
  DecisionRecordSchema.parse(value)

export const parseDebateRound = (value: unknown): DebateRound =>
  DebateRoundSchema.parse(value)

export const parseDecisionRun = (value: unknown): DecisionRun =>
  DecisionRunSchema.parse(value)
