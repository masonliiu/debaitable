import assert from "node:assert/strict"
import test from "node:test"

import {
  parseLlmRequest,
  parseLlmResponse,
} from "../src/ai/validate"

import {
  parseCreateDecisionRequest,
  parseCreateDecisionResponse,
  parseGetDecisionResponse,
  parseErrorResponse,
} from "../src/api/validate"

import {
  parseDecisionInput,
  parseDecision,
  parseDecisionRecord,
  parseDebateRound,
  parseDecisionRun,
} from "../src/core/validate"

import {
  parseProposalOutput,
  parseCritiqueOutput,
  parseConvergenceOutput,
} from "../src/orchestration/validate"

// ---------------------------------------------------------------------------
// src/ai/validate.ts
// ---------------------------------------------------------------------------

test("parseLlmRequest accepts a valid payload", () => {
  const result = parseLlmRequest({
    system: "You are an assistant.",
    prompt: "What is the capital of France?",
    schema: { type: "object" },
  })
  assert.equal(result.system, "You are an assistant.")
  assert.equal(result.prompt, "What is the capital of France?")
})

test("parseLlmRequest rejects a payload missing required fields", () => {
  assert.throws(() => parseLlmRequest({ system: "only system" }), {
    name: "ZodError",
  })
})

test("parseLlmRequest rejects an empty string for system", () => {
  assert.throws(
    () =>
      parseLlmRequest({
        system: "",
        prompt: "valid prompt",
        schema: null,
      }),
    { name: "ZodError" }
  )
})

test("parseLlmRequest rejects non-object input", () => {
  assert.throws(() => parseLlmRequest(null), { name: "ZodError" })
  assert.throws(() => parseLlmRequest("string"), { name: "ZodError" })
})

test("parseLlmResponse accepts a valid payload", () => {
  const result = parseLlmResponse({
    output: { answer: 42 },
    raw: "{\"answer\":42}",
    model: "gpt-5",
  })
  assert.equal(result.model, "gpt-5")
  assert.equal(result.raw, "{\"answer\":42}")
})

test("parseLlmResponse rejects missing model field", () => {
  assert.throws(
    () => parseLlmResponse({ output: {}, raw: "raw text" }),
    { name: "ZodError" }
  )
})

test("parseLlmResponse rejects empty raw string", () => {
  assert.throws(
    () => parseLlmResponse({ output: {}, raw: "", model: "gpt-5" }),
    { name: "ZodError" }
  )
})

// ---------------------------------------------------------------------------
// src/core/validate.ts
// ---------------------------------------------------------------------------

const VALID_DECISION_INPUT = {
  title: "Use microservices",
  context: "We need to scale our backend.",
  goals: ["reduce latency"],
  constraints: ["budget < $50k"],
  decisionType: "engineering",
}

test("parseDecisionInput accepts a valid payload", () => {
  const result = parseDecisionInput(VALID_DECISION_INPUT)
  assert.equal(result.title, "Use microservices")
  assert.equal(result.decisionType, "engineering")
})

test("parseDecisionInput rejects missing title", () => {
  const { title: _t, ...rest } = VALID_DECISION_INPUT
  assert.throws(() => parseDecisionInput(rest), { name: "ZodError" })
})

test("parseDecisionInput rejects empty title string", () => {
  assert.throws(
    () => parseDecisionInput({ ...VALID_DECISION_INPUT, title: "" }),
    { name: "ZodError" }
  )
})

test("parseDecisionInput rejects invalid decisionType", () => {
  assert.throws(
    () => parseDecisionInput({ ...VALID_DECISION_INPUT, decisionType: "unknown" }),
    { name: "ZodError" }
  )
})

test("parseDecisionInput rejects non-array goals", () => {
  assert.throws(
    () => parseDecisionInput({ ...VALID_DECISION_INPUT, goals: "not an array" }),
    { name: "ZodError" }
  )
})

const VALID_DECISION = {
  id: "dec-001",
  title: "Use microservices",
  context: "We need to scale.",
  goals: ["reduce latency"],
  constraints: ["budget < $50k"],
  decisionType: "engineering",
  status: "queued",
  visibility: "private",
}

test("parseDecision accepts a valid decision object", () => {
  const result = parseDecision(VALID_DECISION)
  assert.equal(result.id, "dec-001")
  assert.equal(result.status, "queued")
  assert.equal(result.visibility, "private")
})

test("parseDecision rejects missing id", () => {
  const { id: _id, ...rest } = VALID_DECISION
  assert.throws(() => parseDecision(rest), { name: "ZodError" })
})

test("parseDecision rejects invalid status value", () => {
  assert.throws(
    () => parseDecision({ ...VALID_DECISION, status: "pending" }),
    { name: "ZodError" }
  )
})

test("parseDecision rejects invalid visibility value", () => {
  assert.throws(
    () => parseDecision({ ...VALID_DECISION, visibility: "secret" }),
    { name: "ZodError" }
  )
})

const VALID_DECISION_RECORD = {
  summary: "Adopt microservices.",
  rationale: "Improves scalability.",
  tradeoffs: ["complexity increases"],
  risks: ["deployment overhead"],
  actions: ["migrate service A first"],
  confidence: 0.85,
  minorityReport: "monolith could suffice",
  executiveDecision: {
    decision: "go",
    why: ["ROI is positive"],
    topRisks: ["vendor lock-in"],
    topActions: ["start with service A"],
    stopGoCriteria: "cost overrun > 20%",
  },
}

test("parseDecisionRecord accepts a valid record", () => {
  const result = parseDecisionRecord(VALID_DECISION_RECORD)
  assert.equal(result.confidence, 0.85)
  assert.equal(result.executiveDecision.decision, "go")
})

test("parseDecisionRecord rejects confidence out of range", () => {
  assert.throws(
    () => parseDecisionRecord({ ...VALID_DECISION_RECORD, confidence: 1.5 }),
    { name: "ZodError" }
  )
})

test("parseDecisionRecord rejects missing executiveDecision", () => {
  const { executiveDecision: _e, ...rest } = VALID_DECISION_RECORD
  assert.throws(() => parseDecisionRecord(rest), { name: "ZodError" })
})

test("parseDecisionRecord rejects invalid executive decision value", () => {
  assert.throws(
    () =>
      parseDecisionRecord({
        ...VALID_DECISION_RECORD,
        executiveDecision: {
          ...VALID_DECISION_RECORD.executiveDecision,
          decision: "maybe",
        },
      }),
    { name: "ZodError" }
  )
})

test("parseDebateRound accepts a valid round", () => {
  const result = parseDebateRound({
    roundIndex: 0,
    roleKey: "strategist",
    model: "gpt-5",
    output: "my proposal",
  })
  assert.equal(result.roundIndex, 0)
  assert.equal(result.roleKey, "strategist")
})

test("parseDebateRound rejects negative roundIndex", () => {
  assert.throws(
    () =>
      parseDebateRound({
        roundIndex: -1,
        roleKey: "strategist",
        model: "gpt-5",
        output: "proposal",
      }),
    { name: "ZodError" }
  )
})

test("parseDebateRound rejects invalid roleKey", () => {
  assert.throws(
    () =>
      parseDebateRound({
        roundIndex: 0,
        roleKey: "unknown_role",
        model: "gpt-5",
        output: "proposal",
      }),
    { name: "ZodError" }
  )
})

test("parseDecisionRun accepts a valid run", () => {
  const result = parseDecisionRun({
    runId: "run-1",
    decisionId: "dec-1",
    status: "queued",
  })
  assert.equal(result.runId, "run-1")
  assert.equal(result.status, "queued")
})

test("parseDecisionRun rejects missing runId", () => {
  assert.throws(
    () => parseDecisionRun({ decisionId: "dec-1", status: "queued" }),
    { name: "ZodError" }
  )
})

// ---------------------------------------------------------------------------
// src/api/validate.ts
// ---------------------------------------------------------------------------

const VALID_CREATE_REQUEST = {
  input: VALID_DECISION_INPUT,
  visibility: "private",
}

test("parseCreateDecisionRequest accepts a valid request", () => {
  const result = parseCreateDecisionRequest(VALID_CREATE_REQUEST)
  assert.equal(result.input.title, "Use microservices")
  assert.equal(result.visibility, "private")
})

test("parseCreateDecisionRequest accepts request without optional visibility", () => {
  const result = parseCreateDecisionRequest({ input: VALID_DECISION_INPUT })
  assert.equal(result.input.decisionType, "engineering")
  assert.equal(result.visibility, undefined)
})

test("parseCreateDecisionRequest rejects missing input", () => {
  assert.throws(
    () => parseCreateDecisionRequest({ visibility: "private" }),
    { name: "ZodError" }
  )
})

test("parseCreateDecisionRequest rejects malformed input object", () => {
  assert.throws(
    () => parseCreateDecisionRequest({ input: { title: "" } }),
    { name: "ZodError" }
  )
})

test("parseCreateDecisionResponse accepts a valid response", () => {
  const result = parseCreateDecisionResponse({
    decisionId: "dec-001",
    runId: "run-001",
    status: "queued",
  })
  assert.equal(result.decisionId, "dec-001")
  assert.equal(result.status, "queued")
})

test("parseCreateDecisionResponse rejects missing runId", () => {
  assert.throws(
    () => parseCreateDecisionResponse({ decisionId: "dec-001", status: "queued" }),
    { name: "ZodError" }
  )
})

test("parseGetDecisionResponse accepts a valid response", () => {
  const result = parseGetDecisionResponse({
    decision: VALID_DECISION,
    record: null,
    rounds: [],
    runs: [],
  })
  assert.equal(result.decision.id, "dec-001")
  assert.equal(result.record, null)
})

test("parseGetDecisionResponse rejects missing decision field", () => {
  assert.throws(
    () => parseGetDecisionResponse({ record: null, rounds: [], runs: [] }),
    { name: "ZodError" }
  )
})

test("parseErrorResponse accepts a valid error payload", () => {
  const result = parseErrorResponse({ error: "not found", code: "not_found" })
  assert.equal(result.code, "not_found")
})

test("parseErrorResponse rejects empty error string", () => {
  assert.throws(
    () => parseErrorResponse({ error: "", code: "not_found" }),
    { name: "ZodError" }
  )
})

test("parseErrorResponse rejects invalid error code", () => {
  assert.throws(
    () => parseErrorResponse({ error: "oops", code: "unknown_code" }),
    { name: "ZodError" }
  )
})

// ---------------------------------------------------------------------------
// src/orchestration/validate.ts
// ---------------------------------------------------------------------------

const VALID_PROPOSAL = {
  roleKey: "strategist",
  summary: "Adopt the proposal.",
  recommendation: "Proceed with microservices.",
  rationale: "Enables independent scaling.",
  risks: ["increased ops complexity"],
  assumptions: ["team has k8s skills"],
  actions: ["migrate service A first"],
}

test("parseProposalOutput accepts a valid proposal", () => {
  const result = parseProposalOutput(VALID_PROPOSAL)
  assert.equal(result.roleKey, "strategist")
  assert.deepEqual(result.actions, ["migrate service A first"])
})

test("parseProposalOutput rejects missing recommendation", () => {
  const { recommendation: _r, ...rest } = VALID_PROPOSAL
  assert.throws(() => parseProposalOutput(rest), { name: "ZodError" })
})

test("parseProposalOutput rejects invalid roleKey", () => {
  assert.throws(
    () => parseProposalOutput({ ...VALID_PROPOSAL, roleKey: "cfo" }),
    { name: "ZodError" }
  )
})

test("parseProposalOutput rejects non-array risks", () => {
  assert.throws(
    () => parseProposalOutput({ ...VALID_PROPOSAL, risks: "high" }),
    { name: "ZodError" }
  )
})

const VALID_CRITIQUE = {
  roleKey: "skeptic",
  critiques: ["not enough evidence"],
  rebuttals: ["evidence exists in appendix"],
  openQuestions: ["what is the timeline?"],
}

test("parseCritiqueOutput accepts a valid critique", () => {
  const result = parseCritiqueOutput(VALID_CRITIQUE)
  assert.equal(result.roleKey, "skeptic")
  assert.equal(result.critiques.length, 1)
})

test("parseCritiqueOutput rejects missing critiques array", () => {
  const { critiques: _c, ...rest } = VALID_CRITIQUE
  assert.throws(() => parseCritiqueOutput(rest), { name: "ZodError" })
})

test("parseCritiqueOutput rejects empty-string critique entry", () => {
  assert.throws(
    () => parseCritiqueOutput({ ...VALID_CRITIQUE, critiques: [""] }),
    { name: "ZodError" }
  )
})

const VALID_CONVERGENCE = {
  roleKey: "cost_roi",
  vote: "support",
  reasons: ["positive ROI within 12 months"],
  conditions: [],
}

test("parseConvergenceOutput accepts a valid convergence payload", () => {
  const result = parseConvergenceOutput(VALID_CONVERGENCE)
  assert.equal(result.vote, "support")
  assert.equal(result.roleKey, "cost_roi")
})

test("parseConvergenceOutput rejects invalid vote value", () => {
  assert.throws(
    () => parseConvergenceOutput({ ...VALID_CONVERGENCE, vote: "abstain" }),
    { name: "ZodError" }
  )
})

test("parseConvergenceOutput rejects missing reasons array", () => {
  const { reasons: _r, ...rest } = VALID_CONVERGENCE
  assert.throws(() => parseConvergenceOutput(rest), { name: "ZodError" })
})

test("parseConvergenceOutput rejects non-object input", () => {
  assert.throws(() => parseConvergenceOutput(42), { name: "ZodError" })
  assert.throws(() => parseConvergenceOutput([]), { name: "ZodError" })
})
