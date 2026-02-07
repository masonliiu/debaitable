import { DecisionInput, RoleKey } from '../core'
import { LlmProvider, LlmRequest, LlmResponse } from './types'

type RoundKind = 'proposal' | 'critique' | 'convergence' | 'record'

const parseInput = (prompt: string): DecisionInput | null => {
  const marker = 'Decision input:\n'
  const start = prompt.indexOf(marker)
  if (start < 0) {
    return null
  }
  const after = prompt.slice(start + marker.length)
  const end = after.indexOf('\n\n')
  const jsonText = (end >= 0 ? after.slice(0, end) : after).trim()
  try {
    return JSON.parse(jsonText) as DecisionInput
  } catch {
    return null
  }
}

const parseRoleKey = (prompt: string): RoleKey => {
  const match = prompt.match(/"roleKey":"([a-z_]+)"/)
  if (!match) {
    return 'strategist'
  }
  return match[1] as RoleKey
}

const inferRound = (prompt: string): RoundKind => {
  if (prompt.includes('Task: Provide an independent proposal.')) {
    return 'proposal'
  }
  if (prompt.includes('Task: Provide critiques and rebuttals')) {
    return 'critique'
  }
  if (prompt.includes('Task: Converge and vote.')) {
    return 'convergence'
  }
  return 'record'
}

const pickVote = (roleKey: RoleKey): 'support' | 'conditional' | 'oppose' => {
  if (roleKey === 'skeptic') {
    return 'conditional'
  }
  if (roleKey === 'risk_analyst') {
    return 'conditional'
  }
  return 'support'
}

const toResponse = <TOutput>(output: TOutput): LlmResponse<TOutput> => ({
  output,
  raw: JSON.stringify(output),
  model: 'heuristic-v1',
})

export class HeuristicDebateProvider implements LlmProvider {
  async generate<TSchema, TOutput>(
    request: LlmRequest<TSchema>
  ): Promise<LlmResponse<TOutput>> {
    const input = parseInput(request.prompt)
    const roleKey = parseRoleKey(request.prompt)
    const round = inferRound(request.prompt)

    if (!input) {
      throw new Error('HeuristicDebateProvider: missing decision input in prompt')
    }

    if (round === 'proposal') {
      const output = {
        roleKey,
        summary: `${input.title}: ${roleKey} perspective for ${input.decisionType}.`,
        recommendation: `Prioritize a scoped rollout focused on ${input.goals[0] ?? 'core goal'}.`,
        rationale: `This balances objective achievement with the key constraint: ${input.constraints[0] ?? 'limited capacity'}.`,
        risks: [
          `Execution drift may weaken ${input.goals[0] ?? 'goal delivery'}.`,
          'Scope creep can break timeline and quality.',
        ],
        assumptions: [
          'Baseline metrics are available and trustworthy.',
          'Cross-functional owners can execute within current constraints.',
        ],
        actions: [
          'Define success metrics and guardrails before implementation.',
          'Run a small pilot and compare against baseline.',
          'Review pilot outcomes before expanding scope.',
        ],
      }
      return toResponse(output as TOutput)
    }

    if (round === 'critique') {
      const output = {
        roleKey,
        critiques: [
          'Current proposals under-specify rollback and failure thresholds.',
          'Dependencies and ownership boundaries are not explicit enough.',
        ],
        rebuttals: [
          'A constrained pilot can validate assumptions before full commitment.',
          'A staged plan can reduce downside while preserving speed.',
        ],
        openQuestions: [
          'What metric threshold triggers expansion versus rollback?',
          'Which team owns cross-functional coordination and deadline risk?',
        ],
      }
      return toResponse(output as TOutput)
    }

    if (round === 'convergence') {
      const vote = pickVote(roleKey)
      const output = {
        roleKey,
        vote,
        reasons: [
          `Recommendation aligns with ${input.goals[0] ?? 'the primary objective'}.`,
          `Plan acknowledges constraint: ${input.constraints[0] ?? 'delivery risk'}.`,
        ],
        conditions:
          vote === 'support'
            ? []
            : [
                'Set clear stop/continue criteria before rollout.',
                'Assign accountable owner for risk and dependency tracking.',
              ],
      }
      return toResponse(output as TOutput)
    }

    const output = {
      summary: `Proceed with a scoped implementation for ${input.title}.`,
      rationale:
        'Role debate converges on phased execution with measurable guardrails and explicit ownership.',
      tradeoffs: [
        'Faster progress from constrained rollout vs slower certainty from deeper upfront analysis.',
        'Tighter scope lowers risk but may delay broader upside.',
      ],
      risks: [
        'Incomplete ownership can delay delivery.',
        'Weak measurement can hide underperformance.',
      ],
      actions: [
        'Approve pilot scope, metrics, and owners.',
        'Run pilot against baseline and review outcomes.',
        'Expand only when thresholds are met.',
      ],
      confidence: 0.68,
      minorityReport:
        'Conditional voters requested explicit rollback thresholds and stronger dependency ownership.',
    }
    return toResponse(output as TOutput)
  }
}
