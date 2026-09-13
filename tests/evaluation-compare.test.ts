import assert from "node:assert/strict"
import test from "node:test"

import {
  EVALUATION_SCENARIOS,
  compareConsensusToIndividuals,
  evaluationReportToMarkdown,
  parseEvaluationArgs,
  runEvaluationReport,
  type StrategyEvaluation,
} from "../src/evaluation/consensus-comparison"

test("evaluation dataset stays fixed and covers five decision types", () => {
  assert.equal(EVALUATION_SCENARIOS.length, 5)
  assert.equal(new Set(EVALUATION_SCENARIOS.map((scenario) => scenario.id)).size, 5)
  for (const scenario of EVALUATION_SCENARIOS) {
    assert.ok(scenario.input.title)
    assert.ok(scenario.input.context)
    assert.ok(scenario.input.goals.length > 0)
    assert.ok(scenario.input.constraints.length > 0)
  }
})

test("comparison preserves both strategies, identities, votes, and minority reports", async () => {
  const report = await runEvaluationReport([EVALUATION_SCENARIOS[0]])
  const scenario = report.scenarios[0]

  assert.equal(report.schemaVersion, 1)
  assert.equal(report.provider, "heuristic")
  assert.equal(scenario.individuals.length, 5)
  assert.equal(scenario.strategies.length, 2)
  assert.deepEqual(
    scenario.strategies.map((result) => result.strategy),
    ["equal", "confidence-weighted"],
  )
  for (const result of scenario.strategies) {
    assert.equal(result.ok, true)
    assert.ok(result.modelIdentities.length > 0)
    assert.ok(result.consensusDecision)
    assert.ok(result.minorityReport)
    assert.equal(result.agreements + result.disagreements, 5)
    assert.equal(result.roles.length, 5)
    assert.ok(result.roles.every((role) => role.model && role.vote))
  }
  assert.deepEqual(report.aggregate.equal, { win: 1, tie: 0, loss: 0 })
  assert.deepEqual(report.aggregate["confidence-weighted"], { win: 1, tie: 0, loss: 0 })

  const markdown = evaluationReportToMarkdown(report)
  assert.match(markdown, /Aggregate comparison/)
  assert.match(markdown, /confidence-weighted/)
  assert.match(markdown, /Minority report/)
  assert.match(markdown, /heuristic-only/)
})

test("comparison labels a consensus that differs from the individual mode as loss", () => {
  const result: StrategyEvaluation = {
    strategy: "equal",
    ok: true,
    modelIdentities: ["model-a"],
    consensusDecision: "no",
    roles: [],
    agreements: 0,
    disagreements: 0,
    comparisonToIndividualMode: "tie",
  }
  const compared = compareConsensusToIndividuals(result, [
    { roleKey: "strategist", model: "a", ok: true, decision: "yes" },
    { roleKey: "skeptic", model: "b", ok: true, decision: "yes" },
    { roleKey: "risk_analyst", model: "c", ok: true, decision: "conditional" },
  ])
  assert.equal(compared.comparisonToIndividualMode, "loss")
  assert.equal(compared.agreements, 0)
  assert.equal(compared.disagreements, 3)
})

test("CLI argument parser supports both strategies and safe output overrides", () => {
  assert.deepEqual(
    parseEvaluationArgs(["--strategy", "both", "--out", "tmp/report.md", "--json-out", "tmp/report.json"]),
    {
      strategies: ["equal", "confidence-weighted"],
      markdownPath: "tmp/report.md",
      jsonPath: "tmp/report.json",
    },
  )
  assert.deepEqual(parseEvaluationArgs(["--strategy", "equal"]).strategies, ["equal"])
  assert.throws(() => parseEvaluationArgs(["--strategy", "unknown"]), /must be equal/)
})
