import assert from "node:assert/strict"
import test from "node:test"

import { sanitizeDecisionInput } from "../src/core/sanitize"
import { formatVoteTally, tallyVotes } from "../src/orchestration/votes"
import type { ConvergenceOutput } from "../src/orchestration/types"

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
