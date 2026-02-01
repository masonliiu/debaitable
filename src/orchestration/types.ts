import { RoleKey } from "../core"

export type ProposalOutput = {
  roleKey: RoleKey
  summary: string
  recommendation: string
  rationale: string
  risks: string[]
  assumptions: string[]
  actions: string[]
}

export type CritiqueOutput = {
  roleKey: RoleKey
  critiques: string[]
  rebuttals: string[]
  openQuestions: string[]
}

export type Vote = "support" | "conditional" | "oppose"

export type ConvergenceOutput = {
  roleKey: RoleKey
  vote: Vote
  reasons: string[]
  conditions: string[]
}
