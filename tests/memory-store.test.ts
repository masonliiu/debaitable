import assert from "node:assert/strict"
import test from "node:test"

import { MemoryDecisionStore } from "../src/persistence/memory-store"
import { NotFoundError } from "../src/core"
import type { DecisionCreateInput } from "../src/persistence/types"
import type { DecisionRecord, DecisionRun } from "../src/core/types"

const baseInput: DecisionCreateInput = {
  title: "Test Decision",
  context: "Some context",
  goals: ["goal1"],
  constraints: ["constraint1"],
  decisionType: "engineering",
  visibility: "private",
}

const sampleRecord: DecisionRecord = {
  summary: "summary",
  rationale: "rationale",
  tradeoffs: ["tradeoff1"],
  risks: ["risk1"],
  actions: ["action1"],
  confidence: 0.9,
  minorityReport: "none",
  executiveDecision: {
    decision: "go",
    why: ["because"],
    topRisks: ["risk1"],
    topActions: ["action1"],
    stopGoCriteria: "criteria",
  },
}

// ---------------------------------------------------------------------------
// createDecision / getDecision
// ---------------------------------------------------------------------------

test("createDecision returns a decision with a generated id", async () => {
  const store = new MemoryDecisionStore()
  const decision = await store.createDecision(baseInput)
  assert.ok(decision.id, "id must be non-empty")
  assert.equal(decision.title, baseInput.title)
  assert.equal(decision.status, "queued")
  assert.equal(decision.visibility, "private")
})

test("getDecision returns the stored decision by id", async () => {
  const store = new MemoryDecisionStore()
  const created = await store.createDecision(baseInput)
  const fetched = await store.getDecision(created.id)
  assert.ok(fetched, "fetched must not be null")
  assert.deepEqual(fetched, created)
})

test("getDecision returns null for a non-existent id", async () => {
  const store = new MemoryDecisionStore()
  const result = await store.getDecision("does-not-exist")
  assert.equal(result, null)
})

test("getDecision returns independent copies (no aliasing)", async () => {
  const store = new MemoryDecisionStore()
  const created = await store.createDecision(baseInput)
  const a = await store.getDecision(created.id)
  const b = await store.getDecision(created.id)
  assert.ok(a && b)
  assert.notEqual(a, b, "different object references")
  assert.deepEqual(a, b)
})

// ---------------------------------------------------------------------------
// updateDecision
// ---------------------------------------------------------------------------

test("updateDecision changes status", async () => {
  const store = new MemoryDecisionStore()
  const created = await store.createDecision(baseInput)
  const updated = await store.updateDecision(created.id, { status: "running" })
  assert.equal(updated.status, "running")
  const fetched = await store.getDecision(created.id)
  assert.ok(fetched)
  assert.equal(fetched.status, "running")
})

test("updateDecision throws NotFoundError for unknown id", async () => {
  const store = new MemoryDecisionStore()
  await assert.rejects(
    () => store.updateDecision("unknown", { status: "failed" }),
    (err: unknown) => err instanceof NotFoundError
  )
})

// ---------------------------------------------------------------------------
// saveDecisionRecord / getDecisionRecord
// ---------------------------------------------------------------------------

test("saveDecisionRecord and getDecisionRecord round-trip", async () => {
  const store = new MemoryDecisionStore()
  const created = await store.createDecision(baseInput)
  await store.saveDecisionRecord(created.id, sampleRecord)
  const fetched = await store.getDecisionRecord(created.id)
  assert.ok(fetched, "record must not be null")
  assert.deepEqual(fetched, sampleRecord)
})

test("getDecisionRecord returns null for a non-existent id", async () => {
  const store = new MemoryDecisionStore()
  const result = await store.getDecisionRecord("no-such-id")
  assert.equal(result, null)
})

test("saveDecisionRecord throws NotFoundError when decision does not exist", async () => {
  const store = new MemoryDecisionStore()
  await assert.rejects(
    () => store.saveDecisionRecord("ghost", sampleRecord),
    (err: unknown) => err instanceof NotFoundError
  )
})

// ---------------------------------------------------------------------------
// saveDebateRounds / getDebateRounds
// ---------------------------------------------------------------------------

test("saveDebateRounds and getDebateRounds round-trip", async () => {
  const store = new MemoryDecisionStore()
  const created = await store.createDecision(baseInput)
  const rounds = [
    { roundIndex: 0, roleKey: "strategist" as const, model: "gpt-5", output: "proposal" },
    { roundIndex: 1, roleKey: "skeptic" as const, model: "gpt-5", output: "critique" },
  ]
  await store.saveDebateRounds(created.id, rounds)
  const fetched = await store.getDebateRounds(created.id)
  assert.deepEqual(fetched, rounds)
})

test("getDebateRounds returns empty array for unknown id", async () => {
  const store = new MemoryDecisionStore()
  const result = await store.getDebateRounds("missing")
  assert.deepEqual(result, [])
})

// ---------------------------------------------------------------------------
// saveDecisionRun / getDecisionRun / listDecisionRuns
// ---------------------------------------------------------------------------

const makeRun = (decisionId: string, runId: string): DecisionRun => ({
  runId,
  decisionId,
  status: "queued",
})

test("saveDecisionRun and getDecisionRun round-trip", async () => {
  const store = new MemoryDecisionStore()
  const created = await store.createDecision(baseInput)
  const run = makeRun(created.id, "run-1")
  await store.saveDecisionRun(run)
  const fetched = await store.getDecisionRun("run-1")
  assert.ok(fetched)
  assert.deepEqual(fetched, run)
})

test("getDecisionRun returns null for unknown runId", async () => {
  const store = new MemoryDecisionStore()
  const result = await store.getDecisionRun("nonexistent")
  assert.equal(result, null)
})

test("listDecisionRuns returns all runs for a decision", async () => {
  const store = new MemoryDecisionStore()
  const created = await store.createDecision(baseInput)
  const run1 = makeRun(created.id, "run-a")
  const run2 = makeRun(created.id, "run-b")
  await store.saveDecisionRun(run1)
  await store.saveDecisionRun(run2)
  const runs = await store.listDecisionRuns(created.id)
  assert.equal(runs.length, 2)
  const ids = runs.map((r) => r.runId).sort()
  assert.deepEqual(ids, ["run-a", "run-b"])
})

test("listDecisionRuns returns empty array when no runs exist", async () => {
  const store = new MemoryDecisionStore()
  const created = await store.createDecision(baseInput)
  const runs = await store.listDecisionRuns(created.id)
  assert.deepEqual(runs, [])
})

test("saveDecisionRun deduplicates repeated saves of the same runId", async () => {
  const store = new MemoryDecisionStore()
  const created = await store.createDecision(baseInput)
  const run = makeRun(created.id, "run-dup")
  await store.saveDecisionRun(run)
  await store.saveDecisionRun({ ...run, status: "succeeded" })
  const runs = await store.listDecisionRuns(created.id)
  assert.equal(runs.length, 1, "duplicate runId must not be listed twice")
  assert.equal(runs[0]!.status, "succeeded")
})

test("saveDecisionRun throws NotFoundError when decision does not exist", async () => {
  const store = new MemoryDecisionStore()
  await assert.rejects(
    () => store.saveDecisionRun(makeRun("ghost-decision", "run-x")),
    (err: unknown) => err instanceof NotFoundError
  )
})

// ---------------------------------------------------------------------------
// Multiple independent decisions (listing isolation)
// ---------------------------------------------------------------------------

test("multiple decisions are stored independently", async () => {
  const store = new MemoryDecisionStore()
  const a = await store.createDecision({ ...baseInput, title: "Decision A" })
  const b = await store.createDecision({ ...baseInput, title: "Decision B" })
  assert.notEqual(a.id, b.id)
  const fetchedA = await store.getDecision(a.id)
  const fetchedB = await store.getDecision(b.id)
  assert.equal(fetchedA?.title, "Decision A")
  assert.equal(fetchedB?.title, "Decision B")
})
