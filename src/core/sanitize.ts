import { DecisionInput } from "./types"

const normalizeText = (value: string) => value.replace(/\r\n/g, "\n").trim()

const normalizeList = (values: string[]) =>
  values.map(normalizeText).filter((value) => value.length > 0)

export const sanitizeDecisionInput = (input: DecisionInput): DecisionInput => ({
  title: normalizeText(input.title),
  context: normalizeText(input.context),
  goals: normalizeList(input.goals),
  constraints: normalizeList(input.constraints),
  decisionType: input.decisionType,
})
