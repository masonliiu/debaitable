import { z } from "zod"
import { DecisionRecordSchema, RoleKeySchema } from "../core"

export const ProposalOutputSchema = z.object({
  roleKey: RoleKeySchema,
  summary: z.string().min(1),
  recommendation: z.string().min(1),
  rationale: z.string().min(1),
  risks: z.array(z.string().min(1)),
  assumptions: z.array(z.string().min(1)),
  actions: z.array(z.string().min(1)),
})

export const CritiqueOutputSchema = z.object({
  roleKey: RoleKeySchema,
  critiques: z.array(z.string().min(1)),
  rebuttals: z.array(z.string().min(1)),
  openQuestions: z.array(z.string().min(1)),
})

export const VoteSchema = z.enum(["support", "conditional", "oppose"])

export const ConvergenceOutputSchema = z.object({
  roleKey: RoleKeySchema,
  vote: VoteSchema,
  reasons: z.array(z.string().min(1)),
  conditions: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1).optional(),
})

export const RoleComparisonSchema = z.object({
  roleKey: RoleKeySchema,
  model: z.string().min(1),
  vote: VoteSchema,
  rawPosition: z.string(),
  agreements: z.array(z.string()),
  disagreements: z.array(z.string()),
  confidence: z.number().min(0).max(1).optional(),
})

export const ComparisonArtifactSchema = z.object({
  roles: z.array(RoleComparisonSchema),
  finalConsensus: DecisionRecordSchema,
  // Optional so artifacts created before degraded-run telemetry remain valid.
  status: z.enum(["ok", "degraded"]).optional(),
  failures: z.array(z.object({
    roleKey: z.string().min(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    kind: z.enum(["timeout", "malformed", "auth", "unknown"]),
    retryCount: z.number().int().nonnegative(),
    fallbackUsed: z.boolean(),
    message: z.string().max(240).optional(),
  })).optional(),
  consensusStrategy: z.enum(["equal", "confidence-weighted"]).optional(),
})
