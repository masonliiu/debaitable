import { DecisionInput } from '../../core'
import { getDecision } from '../../api'

export type RunState = 'idle' | 'running' | 'done' | 'error'

export type SessionHistoryItem = {
  createdAt: string
  decisionId: string
  title: string
  decision: string
  artifactPath: string
  input: DecisionInput
  result: Awaited<ReturnType<typeof getDecision>>
}

export type TuiState = {
  mode: 'openai' | 'heuristic'
  runState: RunState
  showAudit: boolean
  showDetails: boolean
  logs: string[]
  currentInput: DecisionInput | null
  currentResult: Awaited<ReturnType<typeof getDecision>> | null
  history: SessionHistoryItem[]
  selectedHistoryIndex: number
  statusMessage: string
  commandHint: string
}

export const createInitialState = (mode: 'openai' | 'heuristic'): TuiState => ({
  mode,
  runState: 'idle',
  showAudit: false,
  showDetails: false,
  logs: ['Ready. Type a prompt and press Enter to run.'],
  currentInput: null,
  currentResult: null,
  history: [],
  selectedHistoryIndex: 0,
  statusMessage: 'Ready.',
  commandHint:
    'Enter run  i focus prompt  e guided edit  a audit  d details  m model  r rerun  [ ] history  tab focus  q quit',
})
