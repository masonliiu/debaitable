import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import { DecisionRecordSchema } from "../src/core/schemas.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const artifactPath = join(__dirname, "fixtures", "decision-artifact.json")

describe("Example artifact: DecisionRecord schema validation", () => {
  it("reads tests/fixtures/decision-artifact.json and validates it against DecisionRecordSchema", () => {
    const raw = readFileSync(artifactPath, "utf-8")
    const json: unknown = JSON.parse(raw)
    const result = DecisionRecordSchema.safeParse(json)
    assert.ok(
      result.success,
      `Example artifact failed DecisionRecordSchema validation: ${
        !result.success ? JSON.stringify(result.error.issues, null, 2) : ""
      }`
    )
  })

  it("example artifact confidence is within [0, 1]", () => {
    const raw = readFileSync(artifactPath, "utf-8")
    const json = JSON.parse(raw) as { confidence?: unknown }
    assert.ok(
      typeof json.confidence === "number" && json.confidence >= 0 && json.confidence <= 1,
      "confidence must be a number in [0, 1]"
    )
  })

  it("example artifact executiveDecision.decision is a valid enum value", () => {
    const raw = readFileSync(artifactPath, "utf-8")
    const json = JSON.parse(raw) as { executiveDecision?: { decision?: unknown } }
    const valid = ["go", "iterate", "stop", "yes", "no", "conditional"]
    assert.ok(
      valid.includes(json.executiveDecision?.decision as string),
      `executiveDecision.decision must be one of: ${valid.join(", ")}`
    )
  })
})
