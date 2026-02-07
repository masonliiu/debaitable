import { DecisionInput, RoleDefinition } from "../core"
import { PROMPT_VERSION } from "./constants"
import {
  ConvergenceOutput,
  CritiqueOutput,
  ProposalOutput,
} from "./types"
import {
  formatCompactConvergence,
  formatCompactCritiques,
  formatCompactProposals,
} from "./compact"
import { formatVoteTally, tallyVotes } from "./votes"

const formatDecisionInput = (input: DecisionInput): string =>
  JSON.stringify(
    {
      title: input.title,
      context: input.context,
      goals: input.goals,
      constraints: input.constraints,
      decisionType: input.decisionType,
    },
    null,
    2
  )

const formatProposalList = (outputs: ProposalOutput[]): string =>
  formatCompactProposals(outputs)

const formatCritiqueList = (outputs: CritiqueOutput[]): string =>
  formatCompactCritiques(outputs)

const formatConvergenceList = (outputs: ConvergenceOutput[]): string =>
  formatCompactConvergence(outputs)

const baseInstructions = [
  `Prompt version: ${PROMPT_VERSION}.`,
  "Return JSON only.",
  "Use double quotes for all keys and string values.",
  "Do not include code fences or commentary.",
  "Arrays must contain only strings, not objects.",
  "Keep writing concise and non-repetitive.",
  "Use plain, direct language with short sentences.",
  "Avoid unexplained acronyms. If you must use one, define it once.",
  "Prioritize clear reasoning over buzzwords.",
  "Keep claims tied to the user's subject. Do not introduce unrelated domains.",
  "Avoid placeholder text and malformed tokens.",
].join(" ")

const compactKeyHint =
  "Compact context keys: rk=roleKey, s=summary, rec=recommendation, rat=rationale, r=risks, a=assumptions, act=actions, c=critiques or conditions, rb=rebuttals, q=openQuestions, v=vote, rs=reasons."

const proposalSchemaHint = (roleKey: string) =>
  [
    '{"roleKey":"',
    roleKey,
    '","summary":"...","recommendation":"...","rationale":"...",',
    '"risks":["..."],"assumptions":["..."],"actions":["..."]}',
  ].join("")

const critiqueSchemaHint = (roleKey: string) =>
  [
    '{"roleKey":"',
    roleKey,
    '","critiques":["..."],"rebuttals":["..."],"openQuestions":["..."]}',
  ].join("")

const convergenceSchemaHint = (roleKey: string) =>
  [
    '{"roleKey":"',
    roleKey,
    '","vote":"support|conditional|oppose","reasons":["..."],',
    '"conditions":["..."]}',
  ].join("")

const decisionRecordSchemaHint = [
  '{"summary":"...","rationale":"...","tradeoffs":["..."],',
  '"risks":["..."],"actions":["..."],"confidence":0.0,',
  '"minorityReport":"...",',
  '"executiveDecision":{"decision":"go|iterate|stop|yes|no|conditional","why":["..."],',
  '"topRisks":["..."],"topActions":["..."],"stopGoCriteria":"..."}}',
].join("")

export const buildProposalPrompt = (
  role: RoleDefinition,
  input: DecisionInput
): { system: string; prompt: string } => ({
  system: [
    "You are a decision role in a structured debate.",
    `Role: ${role.name}.`,
    `Focus: ${role.focus}.`,
    baseInstructions,
  ].join(" "),
  prompt: [
    "Decision input:",
    formatDecisionInput(input),
    "",
    "Task: Provide an independent proposal.",
    "Limits: summary <= 260 chars, recommendation <= 260 chars, rationale <= 320 chars, risks/assumptions <= 6 each, actions <= 8.",
    "Output JSON schema:",
    proposalSchemaHint(role.key),
  ].join("\n"),
})

export const buildCritiquePrompt = (
  role: RoleDefinition,
  input: DecisionInput,
  proposals: ProposalOutput[]
): { system: string; prompt: string } => ({
  system: [
    "You are a decision role in a structured debate.",
    `Role: ${role.name}.`,
    `Focus: ${role.focus}.`,
    baseInstructions,
  ].join(" "),
  prompt: [
    "Decision input:",
    formatDecisionInput(input),
    "",
    "Round 1 proposals:",
    formatProposalList(proposals),
    compactKeyHint,
    "",
    "Task: Provide critiques and rebuttals from your perspective.",
    "Limits: critiques/rebuttals/openQuestions <= 8 items each, each item <= 240 chars.",
    "Output JSON schema:",
    critiqueSchemaHint(role.key),
  ].join("\n"),
})

export const buildConvergencePrompt = (
  role: RoleDefinition,
  input: DecisionInput,
  proposals: ProposalOutput[],
  critiques: CritiqueOutput[]
): { system: string; prompt: string } => ({
  system: [
    "You are a decision role in a structured debate.",
    `Role: ${role.name}.`,
    `Focus: ${role.focus}.`,
    baseInstructions,
  ].join(" "),
  prompt: [
    "Decision input:",
    formatDecisionInput(input),
    "",
    "Round 1 proposals:",
    formatProposalList(proposals),
    compactKeyHint,
    "",
    "Round 2 critiques:",
    formatCritiqueList(critiques),
    compactKeyHint,
    "",
    "Task: Converge and vote.",
    "Limits: reasons/conditions <= 5 items each, each item <= 240 chars.",
    "Output JSON schema:",
    convergenceSchemaHint(role.key),
  ].join("\n"),
})

export const buildDecisionRecordPrompt = (
  input: DecisionInput,
  proposals: ProposalOutput[],
  critiques: CritiqueOutput[],
  convergence: ConvergenceOutput[]
): { system: string; prompt: string } => ({
  system: [
    "You are an aggregator that produces a final Decision Record.",
    baseInstructions,
  ].join(" "),
  prompt: [
    "Decision input:",
    formatDecisionInput(input),
    "",
    "Round 1 proposals:",
    formatProposalList(proposals),
    compactKeyHint,
    "",
    "Round 2 critiques:",
    formatCritiqueList(critiques),
    compactKeyHint,
    "",
    "Round 3 convergence:",
    formatConvergenceList(convergence),
    compactKeyHint,
    "",
    "Vote tally:",
    formatVoteTally(tallyVotes(convergence)),
    "",
    "Task: Produce the final Decision Record with rationale, tradeoffs, risks, actions, confidence (0-1), minority report, and executiveDecision.",
    "Reasoning style: explain the recommendation in a simple chain: evidence -> implications -> decision.",
    "Relevance rule: stay strictly on the user subject and wording. Do not invent unrelated business mechanics.",
    "For non-business topics, avoid terms like KPI, SLA, rollout, pilot, canary, funnel, activation unless explicitly present in input.",
    "Limits: summary <= 420 chars, rationale <= 520 chars, minorityReport <= 360 chars.",
    "Limits: tradeoffs <= 6, risks <= 8, actions <= 8.",
    "Executive block limits: why <= 3, topRisks <= 3, topActions <= 5, stopGoCriteria <= 300 chars.",
    "Use yes/no/conditional for binary or policy questions; use go/iterate/stop for execution/rollout decisions.",
    "No duplicate list items. Prefer concise bullets over long paragraphs.",
    "Output JSON schema:",
    decisionRecordSchemaHint,
  ].join("\n"),
})
