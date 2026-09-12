import assert from "node:assert/strict"
import test from "node:test"

import { sanitizeDecisionInput } from "../src/core/sanitize"
import { formatVoteTally, tallyVotes } from "../src/orchestration/votes"
import type { ConvergenceOutput } from "../src/orchestration/types"
import { runDebate } from "../src/orchestration/run"
import type { LlmProvider, LlmResponse } from "../src/ai/types"
import type { RoleDefinition } from "../src/core/types"

test("sanitizeDecisionInput normalizes text and removes empty list entries", () => {
  const result = sanitizeDecisionInput({
    title: "  Ship it\r\nnow  ",
    context: "  evidence  ",
    goals: [" useful ", "  "],
    constraints: ["safe\r\nrelease"],
    decisionType: "engineering",
  })

  assert.deepEqual(result, {
    title: "Ship it\nnow",
    context: "evidence",
    goals: ["useful"],
    constraints: ["safe\nrelease"],
    decisionType: "engineering",
  })
})

test("tallyVotes counts every supported vote class", () => {
  const base = { roleKey: "strategist", reasons: [], conditions: [] } as const
  const outputs: ConvergenceOutput[] = [
    { ...base, vote: "support" },
    { ...base, vote: "support" },
    { ...base, vote: "conditional" },
    { ...base, vote: "oppose" },
  ]
  const tally = tallyVotes(outputs)
  assert.deepEqual(tally, { support: 2, conditional: 1, oppose: 1 })
  assert.equal(formatVoteTally(tally), JSON.stringify(tally, null, 2))
})

// ---------------------------------------------------------------------------
// Helpers for heterogeneous-provider test
// ---------------------------------------------------------------------------

const makeProposalResponse = (roleKey: string, model: string): LlmResponse<unknown> => ({
  output: {
    roleKey,
    summary: `${model} summary`,
    recommendation: `${model} recommendation`,
    rationale: `${model} rationale`,
    risks: [`${model} risk`],
    assumptions: [`${model} assumption`],
    actions: [`${model} action`],
  },
  raw: "{}",
  model,
})

const makeCritiqueResponse = (roleKey: string, model: string): LlmResponse<unknown> => ({
  output: {
    roleKey,
    critiques: [`${model} critique`],
    rebuttals: [`${model} rebuttal`],
    openQuestions: [`${model} question`],
  },
  raw: "{}",
  model,
})

const makeConvergenceResponse = (roleKey: string, model: string): LlmResponse<unknown> => ({
  output: {
    roleKey,
    vote: "support",
    reasons: [`${model} reason`],
    conditions: [],
  },
  raw: "{}",
  model,
})

/** Creates a provider that serves the given pre-baked responses in order. */
const makeQueueProvider = (responses: LlmResponse<unknown>[]): LlmProvider => {
  const queue = [...responses]
  return {
    generate: async <TSchema, TOutput>(_req: { system: string; prompt: string; schema: TSchema }) => {
      const next = queue.shift()
      if (!next) throw new Error("No responses left in queue")
      return next as LlmResponse<TOutput>
    },
  }
}

test("runDebate routes roles to their assigned providers and captures model identity", async () => {
  // Two roles, two different providers.
  const roles: RoleDefinition[] = [
    { key: "strategist", name: "Strategist", focus: "Strategy" },
    { key: "skeptic", name: "Skeptic", focus: "Skepticism" },
  ]

  // Each provider gets exactly 3 calls: proposal, critique, convergence.
  const strategistProvider = makeQueueProvider([
    makeProposalResponse("strategist", "model-alpha"),
    makeCritiqueResponse("strategist", "model-alpha"),
    makeConvergenceResponse("strategist", "model-alpha"),
  ])

  const skepticProvider = makeQueueProvider([
    makeProposalResponse("skeptic", "model-beta"),
    makeCritiqueResponse("skeptic", "model-beta"),
    makeConvergenceResponse("skeptic", "model-beta"),
  ])

  // Default provider should never be called for these two roles, but
  // runDecisionRecord falls back to deterministic-synth on failure so
  // we can supply an empty-queue provider safely.
  const defaultProvider = makeQueueProvider([])

  const run = await runDebate({
    input: {
      title: "Test decision",
      context: "Testing heterogeneous providers",
      goals: ["Verify routing"],
      constraints: ["None"],
      decisionType: "engineering",
    },
    roles,
    provider: defaultProvider,
    providerMap: {
      strategist: strategistProvider,
      skeptic: skepticProvider,
    },
  })

  // Proposals
  const strategistProposal = run.proposals.find((p) => p.output.roleKey === "strategist")
  const skepticProposal = run.proposals.find((p) => p.output.roleKey === "skeptic")
  assert.ok(strategistProposal, "strategist proposal must exist")
  assert.ok(skepticProposal, "skeptic proposal must exist")
  assert.equal(strategistProposal.model, "model-alpha", "strategist proposal model")
  assert.equal(skepticProposal.model, "model-beta", "skeptic proposal model")

  // Critiques
  const strategistCritique = run.critiques.find((c) => c.output.roleKey === "strategist")
  const skepticCritique = run.critiques.find((c) => c.output.roleKey === "skeptic")
  assert.ok(strategistCritique, "strategist critique must exist")
  assert.ok(skepticCritique, "skeptic critique must exist")
  assert.equal(strategistCritique.model, "model-alpha", "strategist critique model")
  assert.equal(skepticCritique.model, "model-beta", "skeptic critique model")

  // Convergence
  const strategistConv = run.convergence.find((c) => c.output.roleKey === "strategist")
  const skepticConv = run.convergence.find((c) => c.output.roleKey === "skeptic")
  assert.ok(strategistConv, "strategist convergence must exist")
  assert.ok(skepticConv, "skeptic convergence must exist")
  assert.equal(strategistConv.model, "model-alpha", "strategist convergence model")
  assert.equal(skepticConv.model, "model-beta", "skeptic convergence model")

  // The durable rounds consumed by persistence and exported artifacts must
  // retain the model identity, not only the transient in-memory call results.
  assert.deepEqual(
    run.rounds.filter((round) => round.roleKey === "strategist").map((round) => round.model),
    ["model-alpha", "model-alpha", "model-alpha"]
  )
  assert.deepEqual(
    run.rounds.filter((round) => round.roleKey === "skeptic").map((round) => round.model),
    ["model-beta", "model-beta", "model-beta"]
  )
})
