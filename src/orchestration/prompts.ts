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
  '"minorityReport":"..."}',
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
    "Task: Produce the final Decision Record with rationale, tradeoffs, risks, actions, confidence (0-1), and minority report.",
    "Output JSON schema:",
    decisionRecordSchemaHint,
  ].join("\n"),
})
