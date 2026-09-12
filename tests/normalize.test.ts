import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizeProposalOutput,
  normalizeCritiqueOutput,
  normalizeConvergenceOutput,
} from "../src/orchestration/normalize.js"
import {
  ProposalOutputSchema,
  CritiqueOutputSchema,
  ConvergenceOutputSchema,
} from "../src/orchestration/schemas.js"
import type { ProposalOutput, CritiqueOutput, ConvergenceOutput } from "../src/orchestration/types.js"

const BASE_PROPOSAL: ProposalOutput = {
  roleKey: "strategist",
  summary: "summary",
  recommendation: "recommendation",
  rationale: "rationale",
  risks: ["risk one"],
  assumptions: ["assumption one"],
  actions: ["action one"],
}

test("normalizeProposalOutput deduplicates identical risk, action, and assumption strings", () => {
  const input: ProposalOutput = {
    ...BASE_PROPOSAL,
    risks: ["duplicate risk", "duplicate risk", "unique risk"],
    assumptions: ["dup assumption", "Dup Assumption", "other"],
    actions: ["do thing", "do thing", "do other thing"],
  }
  const output = normalizeProposalOutput(input)
  assert.equal(output.risks.length, 2, "risks should be deduplicated")
  assert.equal(output.risks[0], "duplicate risk")
  assert.equal(output.risks[1], "unique risk")
  assert.equal(output.assumptions.length, 2, "assumptions should be deduplicated case-insensitively")
  assert.equal(output.actions.length, 2, "actions should be deduplicated")
})

test("normalizeProposalOutput trims leading and trailing whitespace from string fields", () => {
  const input: ProposalOutput = {
    roleKey: "skeptic",
    summary: "  padded summary  ",
    recommendation: "\t recommendation \n",
    rationale: "  some rationale  ",
    risks: ["  risky business  "],
    assumptions: [" assume this "],
    actions: ["  do it  "],
  }
  const output = normalizeProposalOutput(input)
  assert.equal(output.summary, "padded summary")
  assert.equal(output.recommendation, "recommendation")
  assert.equal(output.rationale, "some rationale")
  assert.equal(output.risks[0], "risky business")
  assert.equal(output.assumptions[0], "assume this")
  assert.equal(output.actions[0], "do it")
})

test("normalizeProposalOutput handles empty arrays without throwing", () => {
  const input: ProposalOutput = {
    roleKey: "risk_analyst",
    summary: "minimal",
    recommendation: "proceed",
    rationale: "because",
    risks: [],
    assumptions: [],
    actions: [],
  }
  const output = normalizeProposalOutput(input)
  assert.deepEqual(output.risks, [])
  assert.deepEqual(output.assumptions, [])
  assert.deepEqual(output.actions, [])
})

test("normalizeProposalOutput output passes ProposalOutputSchema validation", () => {
  const input: ProposalOutput = {
    ...BASE_PROPOSAL,
    risks: ["risk", "risk", "  another risk  "],
    assumptions: ["assume"],
    actions: ["  act  ", "  act  "],
  }
  const output = normalizeProposalOutput(input)
  const result = ProposalOutputSchema.safeParse(output)
  assert.ok(
    result.success,
    `schema rejected: ${!result.success ? JSON.stringify(result.error.issues) : ""}`
  )
})

test("normalizeCritiqueOutput deduplicates critiques and rebuttals", () => {
  const input: CritiqueOutput = {
    roleKey: "execution_planner",
    critiques: ["same critique", "Same Critique", "unique"],
    rebuttals: ["rebuttal", "rebuttal"],
    openQuestions: ["q1", "q1", "q2"],
  }
  const output = normalizeCritiqueOutput(input)
  assert.equal(output.critiques.length, 2)
  assert.equal(output.rebuttals.length, 1)
  assert.equal(output.openQuestions.length, 2)
  const schemaResult = CritiqueOutputSchema.safeParse(output)
  assert.ok(
    schemaResult.success,
    `schema rejected: ${!schemaResult.success ? JSON.stringify(schemaResult.error.issues) : ""}`
  )
})

test("normalizeConvergenceOutput deduplicates reasons and trims whitespace", () => {
  const input: ConvergenceOutput = {
    roleKey: "cost_roi",
    vote: "conditional",
    reasons: ["  reason one  ", "reason one", "reason two"],
    conditions: ["cond", "COND"],
  }
  const output = normalizeConvergenceOutput(input)
  assert.equal(output.reasons.length, 2)
  assert.equal(output.reasons[0], "reason one")
  assert.equal(output.conditions.length, 1)
  const schemaResult = ConvergenceOutputSchema.safeParse(output)
  assert.ok(
    schemaResult.success,
    `schema rejected: ${!schemaResult.success ? JSON.stringify(schemaResult.error.issues) : ""}`
  )
})
