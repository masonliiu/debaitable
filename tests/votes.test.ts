import assert from "node:assert/strict"
import test from "node:test"

import {
  tallyVotes,
  tallyVotesEqual,
  tallyVotesWeighted,
} from "../src/orchestration/votes"
import type { ConvergenceOutput } from "../src/orchestration/types"
import { synthesizeDecisionRecord } from "../src/orchestration/synthesize"

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const base = { reasons: ["reason"], conditions: [] } as const

/** 3 support, 1 conditional, 1 oppose */
const mixedVotes: ConvergenceOutput[] = [
  { roleKey: "strategist", vote: "support",     ...base, confidence: 0.9 },
  { roleKey: "skeptic",    vote: "support",     ...base, confidence: 0.8 },
  { roleKey: "ethicist",   vote: "conditional", ...base, confidence: 0.5 },
  { roleKey: "advocate",   vote: "oppose",      ...base, confidence: 0.6 },
  { roleKey: "analyst",    vote: "support",     ...base, confidence: 0.7 },
]

// ---------------------------------------------------------------------------
// Equal-weighting strategy
// ---------------------------------------------------------------------------

test("tallyVotesEqual counts each vote once regardless of confidence", () => {
  const tally = tallyVotesEqual(mixedVotes)
  assert.equal(tally.support,      3)
  assert.equal(tally.conditional,  1)
  assert.equal(tally.oppose,       1)
})

test("tallyVotes with strategy='equal' matches tallyVotesEqual", () => {
  const a = tallyVotes(mixedVotes, "equal")
  const b = tallyVotesEqual(mixedVotes)
  assert.deepEqual(a, b)
})

test("tallyVotes defaults to equal strategy when strategy is omitted", () => {
  const a = tallyVotes(mixedVotes)
  const b = tallyVotesEqual(mixedVotes)
  assert.deepEqual(a, b)
})

test("tallyVotesEqual handles empty input", () => {
  const tally = tallyVotesEqual([])
  assert.deepEqual(tally, { support: 0, conditional: 0, oppose: 0 })
})

// ---------------------------------------------------------------------------
// Confidence-weighted strategy
// ---------------------------------------------------------------------------

test("tallyVotesWeighted accumulates confidence weights per bucket", () => {
  const tally = tallyVotesWeighted(mixedVotes)
  // support: 0.9 + 0.8 + 0.7 = 2.4
  // conditional: 0.5
  // oppose: 0.6
  assert.ok(
    Math.abs(tally.support - 2.4) < 1e-9,
    `Expected support ~2.4, got ${tally.support}`
  )
  assert.ok(
    Math.abs(tally.conditional - 0.5) < 1e-9,
    `Expected conditional ~0.5, got ${tally.conditional}`
  )
  assert.ok(
    Math.abs(tally.oppose - 0.6) < 1e-9,
    `Expected oppose ~0.6, got ${tally.oppose}`
  )
})

test("tallyVotes with strategy='confidence-weighted' matches tallyVotesWeighted", () => {
  const a = tallyVotes(mixedVotes, "confidence-weighted")
  const b = tallyVotesWeighted(mixedVotes)
  assert.deepEqual(a, b)
})

test("tallyVotesWeighted defaults missing confidence to 1", () => {
  const votes: ConvergenceOutput[] = [
    { roleKey: "strategist", vote: "support",     reasons: [], conditions: [] },
    { roleKey: "skeptic",    vote: "support",     reasons: [], conditions: [], confidence: 0.5 },
    { roleKey: "ethicist",   vote: "oppose",      reasons: [], conditions: [] },
  ]
  const tally = tallyVotesWeighted(votes)
  // support: 1 (default) + 0.5 = 1.5
  // oppose:  1 (default)
  assert.ok(
    Math.abs(tally.support - 1.5) < 1e-9,
    `Expected support ~1.5, got ${tally.support}`
  )
  assert.ok(
    Math.abs(tally.oppose - 1) < 1e-9,
    `Expected oppose ~1, got ${tally.oppose}`
  )
  assert.equal(tally.conditional, 0)
})

test("tallyVotesWeighted handles empty input", () => {
  const tally = tallyVotesWeighted([])
  assert.deepEqual(tally, { support: 0, conditional: 0, oppose: 0 })
})

// ---------------------------------------------------------------------------
// Minority report isolation
// ---------------------------------------------------------------------------

test("minority views (conditional + oppose) are distinct from majority support", () => {
  const tally = tallyVotesEqual(mixedVotes)
  const minorityCount = tally.conditional + tally.oppose
  assert.equal(minorityCount, 2, "two dissenting roles present")
  assert.ok(
    tally.support > minorityCount,
    "majority (support) should exceed combined minority count"
  )
})

test("confidence-weighted minority is preserved even when numerically smaller", () => {
  const tally = tallyVotesWeighted(mixedVotes)
  // support wins (2.4) but minority (conditional 0.5 + oppose 0.6 = 1.1) still
  // has positive weight, ensuring it is not silenced in the final record.
  const minorityWeight = tally.conditional + tally.oppose
  assert.ok(minorityWeight > 0, "minority weight must be positive")
  assert.ok(tally.support > minorityWeight, "majority wins by weight")
})

test("all-oppose scenario: support bucket is zero under both strategies", () => {
  const allOppose: ConvergenceOutput[] = [
    { roleKey: "strategist", vote: "oppose", reasons: ["risky"], conditions: [], confidence: 0.9 },
    { roleKey: "skeptic",    vote: "oppose", reasons: ["costly"], conditions: [], confidence: 0.7 },
  ]
  const equalTally    = tallyVotesEqual(allOppose)
  const weightedTally = tallyVotesWeighted(allOppose)
  assert.equal(equalTally.support, 0)
  assert.equal(weightedTally.support, 0)
  assert.equal(equalTally.oppose, 2)
  assert.ok(weightedTally.oppose > 0)
})

test("selected consensus strategy changes the synthesized executive decision", () => {
  const convergence: ConvergenceOutput[] = [
    { roleKey: "strategist", vote: "support", reasons: ["upside"], conditions: [], confidence: 0.1 },
    { roleKey: "execution_planner", vote: "support", reasons: ["feasible"], conditions: [], confidence: 0.1 },
    { roleKey: "skeptic", vote: "oppose", reasons: ["high-confidence risk"], conditions: [], confidence: 0.9 },
  ]
  const input = { title: "Launch", context: "Evaluate launch", goals: ["growth"], constraints: ["risk"], decisionType: "product" as const }
  const equal = synthesizeDecisionRecord(input, [], [], convergence, "equal")
  const weighted = synthesizeDecisionRecord(input, [], [], convergence, "confidence-weighted")
  assert.equal(equal.executiveDecision.decision, "go")
  assert.equal(weighted.executiveDecision.decision, "stop")
  assert.match(equal.minorityReport, /high-confidence risk/)
  assert.match(weighted.minorityReport, /high-confidence risk/)
})
