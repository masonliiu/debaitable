import { z } from "zod"
import { RoleKeySchema } from "../core"

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
})
