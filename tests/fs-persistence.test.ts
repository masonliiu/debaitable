import assert from "node:assert/strict"
import test from "node:test"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import { FsDecisionStore } from "../src/persistence/fs-store"
import { FsDecisionQueue } from "../src/jobs/fs-queue"
import { NotFoundError } from "../src/core"
import type { DecisionCreateInput } from "../src/persistence/types"
import type { DecisionRecord, DecisionRun } from "../src/core/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "debaitable-test-"))
}

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

const makeRun = (decisionId: string, runId: string): DecisionRun => ({
  runId,
  decisionId,
  status: "queued",
})

// ---------------------------------------------------------------------------
// FsDecisionStore — basic CRUD
// ---------------------------------------------------------------------------

test("FsDecisionStore: createDecision persists and getDecision retrieves", async () => {
  const dir = await makeTmpDir()
  const store = new FsDecisionStore(dir)
  await store.init()
  const decision = await store.createDecision(baseInput)
  assert.ok(decision.id, "id must be non-empty")
  assert.equal(decision.title, baseInput.title)
  assert.equal(decision.status, "queued")
  assert.equal(decision.visibility, "private")
  const fetched = await store.getDecision(decision.id)
  assert.ok(fetched)
  assert.deepEqual(fetched, decision)
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: getDecision returns null for unknown id", async () => {
  const dir = await makeTmpDir()
  const store = new FsDecisionStore(dir)
  await store.init()
  const result = await store.getDecision("does-not-exist")
  assert.equal(result, null)
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: updateDecision changes status and persists", async () => {
  const dir = await makeTmpDir()
  const store = new FsDecisionStore(dir)
  await store.init()
  const created = await store.createDecision(baseInput)
  const updated = await store.updateDecision(created.id, { status: "running" })
  assert.equal(updated.status, "running")
  const fetched = await store.getDecision(created.id)
  assert.ok(fetched)
  assert.equal(fetched.status, "running")
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: updateDecision throws NotFoundError for unknown id", async () => {
  const dir = await makeTmpDir()
  const store = new FsDecisionStore(dir)
  await store.init()
  await assert.rejects(
    () => store.updateDecision("ghost", { status: "failed" }),
    (err: unknown) => err instanceof NotFoundError
  )
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: saveDecisionRecord and getDecisionRecord round-trip", async () => {
  const dir = await makeTmpDir()
  const store = new FsDecisionStore(dir)
  await store.init()
  const created = await store.createDecision(baseInput)
  await store.saveDecisionRecord(created.id, sampleRecord)
  const fetched = await store.getDecisionRecord(created.id)
  assert.ok(fetched)
  assert.deepEqual(fetched, sampleRecord)
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: getDecisionRecord returns null for unknown id", async () => {
  const dir = await makeTmpDir()
  const store = new FsDecisionStore(dir)
  await store.init()
  const result = await store.getDecisionRecord("no-such-id")
  assert.equal(result, null)
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: saveDecisionRecord throws NotFoundError when decision absent", async () => {
  const dir = await makeTmpDir()
  const store = new FsDecisionStore(dir)
  await store.init()
  await assert.rejects(
    () => store.saveDecisionRecord("ghost", sampleRecord),
    (err: unknown) => err instanceof NotFoundError
  )
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: saveDebateRounds and getDebateRounds round-trip", async () => {
  const dir = await makeTmpDir()
  const store = new FsDecisionStore(dir)
  await store.init()
  const created = await store.createDecision(baseInput)
  const rounds = [
    { roundIndex: 0, roleKey: "strategist" as const, model: "gpt-5", output: "proposal" },
    { roundIndex: 1, roleKey: "skeptic" as const, model: "gpt-5", output: "critique" },
  ]
  await store.saveDebateRounds(created.id, rounds)
  const fetched = await store.getDebateRounds(created.id)
  assert.deepEqual(fetched, rounds)
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: getDebateRounds returns empty array for unknown id", async () => {
  const dir = await makeTmpDir()
  const store = new FsDecisionStore(dir)
  await store.init()
  const result = await store.getDebateRounds("missing")
  assert.deepEqual(result, [])
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: saveDecisionRun and listDecisionRuns", async () => {
  const dir = await makeTmpDir()
  const store = new FsDecisionStore(dir)
  await store.init()
  const created = await store.createDecision(baseInput)
  const run1 = makeRun(created.id, "run-a")
  const run2 = makeRun(created.id, "run-b")
  await store.saveDecisionRun(run1)
  await store.saveDecisionRun(run2)
  const runs = await store.listDecisionRuns(created.id)
  assert.equal(runs.length, 2)
  const ids = runs.map((r) => r.runId).sort()
  assert.deepEqual(ids, ["run-a", "run-b"])
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: getDecisionRun returns null for unknown runId", async () => {
  const dir = await makeTmpDir()
  const store = new FsDecisionStore(dir)
  await store.init()
  const result = await store.getDecisionRun("nonexistent")
  assert.equal(result, null)
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: listDecisionRuns returns empty array when no runs exist", async () => {
  const dir = await makeTmpDir()
  const store = new FsDecisionStore(dir)
  await store.init()
  const created = await store.createDecision(baseInput)
  const runs = await store.listDecisionRuns(created.id)
  assert.deepEqual(runs, [])
  await fs.rm(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// FsDecisionStore — persistence across re-instantiation
// ---------------------------------------------------------------------------

test("FsDecisionStore: data survives re-instantiation (simulated restart)", async () => {
  const dir = await makeTmpDir()
  const store1 = new FsDecisionStore(dir)
  await store1.init()
  const created = await store1.createDecision(baseInput)
  await store1.saveDecisionRecord(created.id, sampleRecord)
  const run = makeRun(created.id, "run-restart")
  await store1.saveDecisionRun(run)

  // Simulate process restart: new instance pointing at same dir
  const store2 = new FsDecisionStore(dir)
  await store2.init()
  const fetched = await store2.getDecision(created.id)
  assert.ok(fetched)
  assert.deepEqual(fetched, created)
  const record = await store2.getDecisionRecord(created.id)
  assert.ok(record)
  assert.deepEqual(record, sampleRecord)
  const runs = await store2.listDecisionRuns(created.id)
  assert.equal(runs.length, 1)
  assert.equal(runs[0]!.runId, "run-restart")
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: counter increments correctly across restarts", async () => {
  const dir = await makeTmpDir()
  const store1 = new FsDecisionStore(dir)
  await store1.init()
  const d1 = await store1.createDecision(baseInput)
  const d2 = await store1.createDecision({ ...baseInput, title: "Second" })
  assert.notEqual(d1.id, d2.id)

  const store2 = new FsDecisionStore(dir)
  await store2.init()
  const d3 = await store2.createDecision({ ...baseInput, title: "Third" })
  assert.notEqual(d3.id, d1.id)
  assert.notEqual(d3.id, d2.id)
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionStore: handles missing store file gracefully (empty state)", async () => {
  const dir = await makeTmpDir()
  // Do not call init — rely on lazy init
  const store = new FsDecisionStore(dir)
  const decision = await store.createDecision(baseInput)
  assert.ok(decision.id)
  await fs.rm(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// FsDecisionQueue — enqueue and state transitions
// ---------------------------------------------------------------------------

test("FsDecisionQueue: enqueueDecision adds a queued job", async () => {
  const dir = await makeTmpDir()
  const q = new FsDecisionQueue(dir)
  await q.init()
  await q.enqueueDecision({ decisionId: "d1", runId: "r1" })
  const pending = q.getPending()
  assert.equal(pending.length, 1)
  assert.deepEqual(pending[0], { decisionId: "d1", runId: "r1" })
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionQueue: markActive removes job from pending", async () => {
  const dir = await makeTmpDir()
  const q = new FsDecisionQueue(dir)
  await q.init()
  const payload = { decisionId: "d1", runId: "r1" }
  await q.enqueueDecision(payload)
  await q.markActive(payload)
  assert.deepEqual(q.getPending(), [])
  const all = q.getAll()
  assert.equal(all.length, 1)
  assert.equal(all[0]!.state, "active")
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionQueue: markCompleted sets state to completed", async () => {
  const dir = await makeTmpDir()
  const q = new FsDecisionQueue(dir)
  await q.init()
  const payload = { decisionId: "d1", runId: "r1" }
  await q.enqueueDecision(payload)
  await q.markActive(payload)
  await q.markCompleted(payload)
  const all = q.getAll()
  assert.equal(all[0]!.state, "completed")
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionQueue: markFailed sets state to failed", async () => {
  const dir = await makeTmpDir()
  const q = new FsDecisionQueue(dir)
  await q.init()
  const payload = { decisionId: "d2", runId: "r2" }
  await q.enqueueDecision(payload)
  await q.markFailed(payload)
  const all = q.getAll()
  assert.equal(all[0]!.state, "failed")
  assert.deepEqual(q.getPending(), [])
  await fs.rm(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// FsDecisionQueue — persistence across re-instantiation
// ---------------------------------------------------------------------------

test("FsDecisionQueue: enqueued jobs survive re-instantiation", async () => {
  const dir = await makeTmpDir()
  const q1 = new FsDecisionQueue(dir)
  await q1.init()
  await q1.enqueueDecision({ decisionId: "d1", runId: "r1" })
  await q1.enqueueDecision({ decisionId: "d2", runId: "r2" })

  const q2 = new FsDecisionQueue(dir)
  await q2.init()
  const pending = q2.getPending()
  assert.equal(pending.length, 2)
  const ids = pending.map((p) => p.decisionId).sort()
  assert.deepEqual(ids, ["d1", "d2"])
  await fs.rm(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// FsDecisionQueue — crash recovery
// ---------------------------------------------------------------------------

test("FsDecisionQueue: crash recovery requeues active jobs by default", async () => {
  const dir = await makeTmpDir()
  // Simulate a crash: write a queue file with an active job directly
  await fs.mkdir(dir, { recursive: true })
  const queueFile = path.join(dir, "queue.json")
  const crashedState = {
    jobs: {
      "d1:r1": {
        payload: { decisionId: "d1", runId: "r1" },
        state: "active",
        enqueuedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  }
  await fs.writeFile(queueFile, JSON.stringify(crashedState), "utf8")

  const q = new FsDecisionQueue({ dataDir: dir, crashRecovery: "requeue" })
  await q.init()
  const pending = q.getPending()
  assert.equal(pending.length, 1, "crashed active job must be requeued")
  assert.equal(pending[0]!.decisionId, "d1")
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionQueue: crash recovery fails active jobs when mode=fail", async () => {
  const dir = await makeTmpDir()
  await fs.mkdir(dir, { recursive: true })
  const queueFile = path.join(dir, "queue.json")
  const crashedState = {
    jobs: {
      "d1:r1": {
        payload: { decisionId: "d1", runId: "r1" },
        state: "active",
        enqueuedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  }
  await fs.writeFile(queueFile, JSON.stringify(crashedState), "utf8")

  const q = new FsDecisionQueue({ dataDir: dir, crashRecovery: "fail" })
  await q.init()
  assert.deepEqual(q.getPending(), [], "no pending jobs when mode=fail")
  const all = q.getAll()
  assert.equal(all.length, 1)
  assert.equal(all[0]!.state, "failed", "crashed active job must be marked failed")
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionQueue: crash recovery does not affect completed or failed jobs", async () => {
  const dir = await makeTmpDir()
  await fs.mkdir(dir, { recursive: true })
  const queueFile = path.join(dir, "queue.json")
  const state = {
    jobs: {
      "d1:r1": {
        payload: { decisionId: "d1", runId: "r1" },
        state: "completed",
        enqueuedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      "d2:r2": {
        payload: { decisionId: "d2", runId: "r2" },
        state: "failed",
        enqueuedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  }
  await fs.writeFile(queueFile, JSON.stringify(state), "utf8")

  const q = new FsDecisionQueue({ dataDir: dir, crashRecovery: "requeue" })
  await q.init()
  assert.deepEqual(q.getPending(), [], "completed/failed jobs must not be requeued")
  const all = q.getAll()
  const stateMap = Object.fromEntries(all.map((e) => [e.payload.decisionId, e.state]))
  assert.equal(stateMap["d1"], "completed")
  assert.equal(stateMap["d2"], "failed")
  await fs.rm(dir, { recursive: true, force: true })
})

test("FsDecisionQueue: state changes persist to disk and survive reload", async () => {
  const dir = await makeTmpDir()
  const q1 = new FsDecisionQueue(dir)
  await q1.init()
  const payload = { decisionId: "d1", runId: "r1" }
  await q1.enqueueDecision(payload)
  await q1.markActive(payload)
  await q1.markCompleted(payload)

  const q2 = new FsDecisionQueue(dir)
  await q2.init()
  const all = q2.getAll()
  assert.equal(all.length, 1)
  assert.equal(all[0]!.state, "completed")
  await fs.rm(dir, { recursive: true, force: true })
})
