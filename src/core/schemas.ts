import { z } from "zod"

export const DecisionTypeSchema = z.enum([
  "product",
  "engineering",
  "hiring",
  "growth",
])

export const DecisionStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
])

export const VisibilitySchema = z.enum(["private", "unlisted", "public"])

export const RoleKeySchema = z.enum([
  "strategist",
  "skeptic",
  "risk_analyst",
  "execution_planner",
  "cost_roi",
])

export const DecisionInputSchema = z.object({
  title: z.string().min(1),
  context: z.string().min(1),
  goals: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  decisionType: DecisionTypeSchema,
})

export const RoleDefinitionSchema = z.object({
  key: RoleKeySchema,
  name: z.string().min(1),
  focus: z.string().min(1),
})

export const DebateRoundSchema = z.object({
  roundIndex: z.number().int().nonnegative(),
  roleKey: RoleKeySchema,
  output: z.string().min(1),
})

export const ExecutiveDecisionSchema = z.object({
  decision: z.enum(["go", "iterate", "stop"]),
  why: z.array(z.string().min(1)),
  topRisks: z.array(z.string().min(1)),
  topActions: z.array(z.string().min(1)),
  stopGoCriteria: z.string().min(1),
})

export const DecisionRecordSchema = z.object({
  summary: z.string().min(1),
  rationale: z.string().min(1),
  tradeoffs: z.array(z.string().min(1)),
  risks: z.array(z.string().min(1)),
  actions: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  minorityReport: z.string().min(1),
  executiveDecision: ExecutiveDecisionSchema,
})

export const DecisionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  context: z.string().min(1),
  goals: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  decisionType: DecisionTypeSchema,
  status: DecisionStatusSchema,
  visibility: VisibilitySchema,
})

export const DecisionRunSchema = z.object({
  runId: z.string().min(1),
  decisionId: z.string().min(1),
  status: DecisionStatusSchema,
})
