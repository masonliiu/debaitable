import { DecisionInput, RoleDefinition } from "../core"
import { PROMPT_VERSION } from "./constants"
import {
  ConvergenceOutput,
  CritiqueOutput,
  ProposalOutput,
} from "./types"
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

const formatProposal = (output: ProposalOutput): object => ({
  roleKey: output.roleKey,
  summary: output.summary,
  recommendation: output.recommendation,
  rationale: output.rationale,
  risks: output.risks,
  assumptions: output.assumptions,
  actions: output.actions,
})

const formatCritique = (output: CritiqueOutput): object => ({
  roleKey: output.roleKey,
  critiques: output.critiques,
  rebuttals: output.rebuttals,
  openQuestions: output.openQuestions,
})

const formatConvergence = (output: ConvergenceOutput): object => ({
  roleKey: output.roleKey,
  vote: output.vote,
  reasons: output.reasons,
  conditions: output.conditions,
})

const formatProposalList = (outputs: ProposalOutput[]): string =>
  JSON.stringify(outputs.map(formatProposal), null, 2)

const formatCritiqueList = (outputs: CritiqueOutput[]): string =>
  JSON.stringify(outputs.map(formatCritique), null, 2)

const formatConvergenceList = (outputs: ConvergenceOutput[]): string =>
  JSON.stringify(outputs.map(formatConvergence), null, 2)

const baseInstructions = [
  `Prompt version: ${PROMPT_VERSION}.`,
  "Return JSON only.",
  "Use double quotes for all keys and string values.",
  "Do not include code fences or commentary.",
].join(" ")

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
    "",
    "Round 2 critiques:",
    formatCritiqueList(critiques),
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
    "",
    "Round 2 critiques:",
    formatCritiqueList(critiques),
    "",
    "Round 3 convergence:",
    formatConvergenceList(convergence),
    "",
    "Vote tally:",
    formatVoteTally(tallyVotes(convergence)),
    "",
    "Task: Produce the final Decision Record with rationale, tradeoffs, risks, actions, confidence (0-1), and minority report.",
    "Output JSON schema:",
    decisionRecordSchemaHint,
  ].join("\n"),
})
