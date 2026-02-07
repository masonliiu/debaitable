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

const isBinaryQuestion = (context: string): boolean =>
  /^(should|is|are|can|could|do|does|did|will|would)\b/i.test(context.trim())

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
        summary: `${input.title}: ${roleKey} perspective for ${input.decisionType} analysis.`,
        recommendation: `Prioritize an evidence-backed approach focused on ${input.goals[0] ?? 'the core goal'}.`,
        rationale: `This balances objective achievement with the key constraint: ${input.constraints[0] ?? 'practical limits'}.`,
        risks: [
          `Key assumptions may be wrong and weaken ${input.goals[0] ?? 'the target outcome'}.`,
          'Overconfidence can reduce fairness and decision quality.',
        ],
        assumptions: [
          'Available evidence is relevant and reasonably reliable.',
          'Constraints and stakeholder impacts are represented fairly.',
        ],
        actions: [
          'Define explicit criteria for a strong vs weak recommendation.',
          'Test key assumptions against available evidence.',
          'Document risks and mitigation before finalizing.',
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
      summary: `Conclude a defensible recommendation for ${input.title}.`,
      rationale:
        'Role debate converges on evidence quality, risk handling, and practical feasibility.',
      tradeoffs: [
        'Stronger confidence from stricter evidence thresholds vs faster decision speed with less evidence.',
        'Broader inclusion of edge cases improves safety but increases analysis complexity.',
      ],
      risks: [
        'Biased assumptions can distort conclusions.',
        'Insufficient evidence quality can produce unreliable recommendations.',
      ],
      actions: [
        'Set explicit decision criteria and acceptable uncertainty bounds.',
        'Validate top assumptions with disconfirming evidence checks.',
        'Finalize recommendation with documented tradeoffs and risks.',
      ],
      confidence: 0.68,
      minorityReport:
        'Conditional voters requested clearer evidence thresholds and stronger handling of edge cases.',
      executiveDecision: {
        decision: isBinaryQuestion(input.context) ? 'conditional' : 'iterate',
        why: [
          'The recommendation aligns with stated goals and constraints.',
          'Convergence includes conditional support that can be resolved with clearer criteria.',
        ],
        topRisks: [
          'Unclear evidence standards can skew the final answer.',
          'Missing edge-case analysis can create fairness or safety blind spots.',
          'Weak uncertainty handling can overstate confidence.',
        ],
        topActions: [
          'Define clear recommendation criteria before deciding.',
          'Pressure-test claims against counterarguments and edge cases.',
          'Record uncertainty bounds and confidence rationale.',
          'Update recommendation if critical evidence changes.',
          'Document unresolved questions for follow-up.',
        ],
        stopGoCriteria:
          'Choose the positive path only if evidence quality and risk thresholds are met; otherwise choose the safer alternative or refine.',
      },
    }
    return toResponse(output as TOutput)
  }
}
