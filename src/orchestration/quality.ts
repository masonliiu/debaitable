import { BadRequestError, DecisionRecord } from "../core"

const PLACEHOLDER_EXACT = new Set([
  "final summary",
  "final rationale",
  "tradeoff",
  "risk",
  "action",
  "no minority report",
])

const hasPlaceholder = (value: string): boolean =>
  PLACEHOLDER_EXACT.has(value.trim().toLowerCase())

const assertListNonEmpty = (label: string, values: string[], min: number): void => {
  if (values.length < min) {
    throw new BadRequestError(`Decision record quality: ${label} requires at least ${min} items`)
  }
}

const assertNoMalformedTokens = (value: string, field: string): void => {
  const malformedPatterns = [/\bRun\d+\/\d+\b/, /\btheflag\b/i, /\bRun\d+/]
  if (malformedPatterns.some((pattern) => pattern.test(value))) {
    throw new BadRequestError(`Decision record quality: malformed content in ${field}`)
  }
}

const assertValue = (field: string, value: string): void => {
  if (!value.trim()) {
    throw new BadRequestError(`Decision record quality: ${field} cannot be empty`)
  }
  if (hasPlaceholder(value)) {
    throw new BadRequestError(`Decision record quality: ${field} is placeholder text`)
  }
  assertNoMalformedTokens(value, field)
}

export const assertDecisionRecordQuality = (record: DecisionRecord): void => {
  assertValue("summary", record.summary)
  assertValue("rationale", record.rationale)
  assertValue("minorityReport", record.minorityReport)
  assertValue("executiveDecision.stopGoCriteria", record.executiveDecision.stopGoCriteria)

  assertListNonEmpty("tradeoffs", record.tradeoffs, 2)
  assertListNonEmpty("risks", record.risks, 2)
  assertListNonEmpty("actions", record.actions, 2)
  assertListNonEmpty("executiveDecision.why", record.executiveDecision.why, 1)
  assertListNonEmpty("executiveDecision.topRisks", record.executiveDecision.topRisks, 1)
  assertListNonEmpty("executiveDecision.topActions", record.executiveDecision.topActions, 1)

  for (const value of record.tradeoffs) {
    assertValue("tradeoffs", value)
  }
  for (const value of record.risks) {
    assertValue("risks", value)
  }
  for (const value of record.actions) {
    assertValue("actions", value)
  }
  for (const value of record.executiveDecision.why) {
    assertValue("executiveDecision.why", value)
  }
  for (const value of record.executiveDecision.topRisks) {
    assertValue("executiveDecision.topRisks", value)
  }
  for (const value of record.executiveDecision.topActions) {
    assertValue("executiveDecision.topActions", value)
  }
}
