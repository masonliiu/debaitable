import assert from "node:assert/strict"
import test from "node:test"

import { buildComparisonArtifact } from "../src/orchestration/comparison"
import type { DebateRun } from "../src/orchestration/run"
import type { DecisionRecord } from "../src/core/types"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockConsensus: DecisionRecord = {
  summary: "Proceed with the initiative.",
  rationale: "Majority support with manageable risks.",
  tradeoffs: ["Speed vs thoroughness"],
  risks: ["Budget overrun"],
  actions: ["Assign owner"],
  confidence: 0.75,
  minorityReport: "Skeptic raised budget concerns.",
  executiveDecision: {
    decision: "go",
    why: ["Strategic alignment"],
    topRisks: ["Budget overrun"],
    topActions: ["Assign owner"],
    stopGoCriteria: "Only proceed if budget is approved.",
  },
}

const mockRun: DebateRun = {
  input: {
    title: "Launch new feature",
    context: "Should we launch the new feature in Q4?",
    goals: ["Increase engagement"],
    constraints: ["Limited budget"],
    decisionType: "product",
  },
  proposals: [
    {
      model: "gpt-5",
      raw: "{}",
      output: {
        roleKey: "strategist",
        summary: "Launch aggressively to capture market share.",
        recommendation: "Go for it",
        rationale: "High strategic ROI",
        risks: ["Competitive retaliation"],
        assumptions: ["Market is ready"],
        actions: ["Brief sales team"],
      },
    },
    {
      model: "gpt-4",
      raw: "{}",
      output: {
        roleKey: "skeptic",
        summary: "Caution — data gaps remain.",
        recommendation: "Wait for more data",
        rationale: "Too many unknowns",
        risks: ["Overspend without ROI"],
        assumptions: ["Data will clarify risk"],
        actions: ["Run discovery sprint"],
      },
    },
  ],
  critiques: [
    {
      model: "gpt-5",
      raw: "{}",
      output: {
        roleKey: "strategist",
        critiques: ["Competitor landscape not analysed"],
        rebuttals: ["Strong brand position justifies speed"],
        openQuestions: [],
      },
    },
    {
      model: "gpt-4",
      raw: "{}",
      output: {
        roleKey: "skeptic",
        critiques: ["Budget allocation is not justified by current metrics"],
        rebuttals: [],
        openQuestions: ["What is the expected payback period?"],
      },
    },
  ],
  convergence: [
    {
      model: "model-alpha",
      raw: "{}",
      output: {
        roleKey: "strategist",
        vote: "support",
        reasons: ["Aligns with annual vision"],
        conditions: [],
      },
    },
    {
      model: "model-beta",
      raw: "{}",
      output: {
        roleKey: "skeptic",
        vote: "oppose",
        reasons: ["Insufficient evidence"],
        conditions: ["Require cost-benefit sign-off before proceeding"],
      },
    },
  ],
  decisionRecord: {
    model: "deterministic-synth",
    raw: "{}",
    output: mockConsensus,
  },
  rounds: [],
}

// ---------------------------------------------------------------------------
// Model identity
// ---------------------------------------------------------------------------

test("buildComparisonArtifact assigns distinct model identities to each role", () => {
  const artifact = buildComparisonArtifact(mockRun)
  const strategist = artifact.roles.find((r) => r.roleKey === "strategist")
  const skeptic = artifact.roles.find((r) => r.roleKey === "skeptic")

  assert.ok(strategist, "strategist role should be present")
  assert.ok(skeptic, "skeptic role should be present")
  assert.equal(strategist.model, "model-alpha", "strategist model identity")
  assert.equal(skeptic.model, "model-beta", "skeptic model identity")
  assert.notEqual(strategist.model, skeptic.model, "model identities must differ")
})

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

test("buildComparisonArtifact attributes distinct votes to their respective roles", () => {
  const artifact = buildComparisonArtifact(mockRun)
  const strategist = artifact.roles.find((r) => r.roleKey === "strategist")
  const skeptic = artifact.roles.find((r) => r.roleKey === "skeptic")

  assert.equal(strategist?.vote, "support", "strategist should have support vote")
  assert.equal(skeptic?.vote, "oppose", "skeptic should have oppose vote")
  assert.notEqual(strategist?.vote, skeptic?.vote, "votes must differ between roles")
})

// ---------------------------------------------------------------------------
// Dissent / disagreements
// ---------------------------------------------------------------------------

test("buildComparisonArtifact includes critique text in opposing role disagreements", () => {
  const artifact = buildComparisonArtifact(mockRun)
  const skeptic = artifact.roles.find((r) => r.roleKey === "skeptic")

  assert.ok(
    skeptic?.disagreements.includes("Budget allocation is not justified by current metrics"),
    "critique should appear in disagreements"
  )
})

test("buildComparisonArtifact includes convergence conditions in disagreements", () => {
  const artifact = buildComparisonArtifact(mockRun)
  const skeptic = artifact.roles.find((r) => r.roleKey === "skeptic")

  assert.ok(
    skeptic?.disagreements.includes("Require cost-benefit sign-off before proceeding"),
    "convergence condition should appear in disagreements"
  )
})

test("buildComparisonArtifact maps raw positions from proposal summaries", () => {
  const artifact = buildComparisonArtifact(mockRun)
  const strategist = artifact.roles.find((r) => r.roleKey === "strategist")
  const skeptic = artifact.roles.find((r) => r.roleKey === "skeptic")

  assert.equal(strategist?.rawPosition, "Launch aggressively to capture market share.")
  assert.equal(skeptic?.rawPosition, "Caution — data gaps remain.")
})

// ---------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------

test("buildComparisonArtifact maps rebuttals as agreements for supporting role", () => {
  const artifact = buildComparisonArtifact(mockRun)
  const strategist = artifact.roles.find((r) => r.roleKey === "strategist")

  assert.ok(
    strategist?.agreements.includes("Strong brand position justifies speed"),
    "rebuttal should appear in agreements"
  )
})

// ---------------------------------------------------------------------------
// Final consensus
// ---------------------------------------------------------------------------

test("buildComparisonArtifact propagates finalConsensus from the decision record", () => {
  const artifact = buildComparisonArtifact(mockRun)
  assert.deepEqual(artifact.finalConsensus, mockConsensus)
})

test("buildComparisonArtifact produces one RoleComparison per convergence entry", () => {
  const artifact = buildComparisonArtifact(mockRun)
  assert.equal(artifact.roles.length, mockRun.convergence.length)
})
