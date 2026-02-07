import blessed from 'blessed'
import { createOpenAiProvider, HeuristicDebateProvider, LlmProvider } from '../../ai'
import { roleDefinitions } from '../../core'
import { MemoryDecisionQueue } from '../../jobs'
import { MemoryDecisionStore } from '../../persistence'
import { buildInputFromSituation } from './input-parser'
import { runDecisionPipeline, TuiSessionContext } from './runner'
import { createInitialState, SessionHistoryItem, TuiState } from './state'

const trimForLine = (value: string, max = 80): string =>
  value.length <= max ? value : `${value.slice(0, max - 3)}...`

const renderDraft = (state: TuiState): string => {
  if (!state.currentInput) {
    return 'No brief yet. Type a prompt and press Enter.'
  }

  return [
    `{bold}Title:{/bold} ${state.currentInput.title}`,
    `{bold}Type:{/bold} ${state.currentInput.decisionType}`,
    `{bold}Goals:{/bold} ${state.currentInput.goals.join(' | ')}`,
    `{bold}Constraints:{/bold} ${state.currentInput.constraints.join(' | ')}`,
  ].join('\n')
}

const renderResult = (state: TuiState): string => {
  if (!state.currentResult?.record) {
    return 'No result yet. Run a decision to see output.'
  }

  const record = state.currentResult.record
  const lines: string[] = []

  lines.push('{bold}Final Decision{/bold}')
  lines.push(`Decision: ${record.executiveDecision.decision.toUpperCase()}`)
  lines.push(`Confidence: ${record.confidence}`)
  lines.push(`Summary: ${record.summary}`)
  lines.push('')
  lines.push(`Stop/Go: ${record.executiveDecision.stopGoCriteria}`)
  lines.push('Why:')
  for (const item of record.executiveDecision.why) {
    lines.push(`- ${item}`)
  }
  lines.push('Top actions:')
  for (const item of record.executiveDecision.topActions.slice(0, 3)) {
    lines.push(`- ${item}`)
  }

  if (state.showDetails) {
    lines.push('')
    lines.push('{bold}Details{/bold}')
    lines.push(`Rationale: ${record.rationale}`)
    lines.push('Top risks:')
    for (const item of record.executiveDecision.topRisks) {
      lines.push(`- ${item}`)
    }
    lines.push('Tradeoffs:')
    for (const item of record.tradeoffs) {
      lines.push(`- ${item}`)
    }
    lines.push('Risks:')
    for (const item of record.risks) {
      lines.push(`- ${item}`)
    }
    lines.push('Actions:')
    for (const item of record.actions) {
      lines.push(`- ${item}`)
    }
    lines.push(`Minority: ${record.minorityReport}`)
  } else {
    lines.push('')
    lines.push('{gray-fg}Press d to toggle detailed record.{/gray-fg}')
  }

  if (state.showAudit) {
    lines.push('')
    lines.push('{bold}Audit Timeline{/bold}')
    for (const round of state.currentResult.rounds) {
      lines.push(`- Round ${round.roundIndex} | ${round.roleKey}`)
    }
  } else {
    lines.push('{gray-fg}Press a to toggle audit timeline.{/gray-fg}')
  }

  return lines.join('\n')
}

const renderHistoryLabel = (item: SessionHistoryItem): string =>
  `${item.decision.toUpperCase()} | ${trimForLine(item.title, 38)}`

class DecisionTuiApp {
  private screen: blessed.Widgets.Screen
  private inputBox: blessed.Widgets.TextboxElement
  private briefBox: blessed.Widgets.BoxElement
  private outputBox: blessed.Widgets.BoxElement
  private historyBox: blessed.Widgets.ListElement
  private footer: blessed.Widgets.BoxElement
  private state: TuiState
  private session: TuiSessionContext
  private isReadingInput = false

  constructor() {
    const defaultMode: 'openai' | 'heuristic' = process.env.OPENAI_API_KEY ? 'openai' : 'heuristic'
    this.state = createInitialState(defaultMode)

    this.session = {
      store: new MemoryDecisionStore(),
      queue: new MemoryDecisionQueue(),
      provider: this.makeProvider(defaultMode),
      roles: roleDefinitions,
      runCounter: 0,
    }

    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Quoraim TUI',
      dockBorders: true,
      fullUnicode: true,
    })

    blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 2,
      tags: true,
      style: { fg: 'white', bg: '#1f2736' },
      content: ' {bold}Quoraim{/bold}  Decision TUI  |  concise-first output ',
    })

    this.inputBox = blessed.textbox({
      parent: this.screen,
      top: 2,
      left: 0,
      width: '36%',
      height: 5,
      inputOnFocus: false,
      keys: true,
      mouse: true,
      label: ' Prompt ',
      border: 'line',
      style: { border: { fg: '#5f87ff' }, fg: 'white' },
      value: '',
    })
    this.inputBox.on('submit', () => {
      void this.runCurrentInput()
    })
    this.inputBox.on('click', () => this.focusInput())

    this.briefBox = blessed.box({
      parent: this.screen,
      top: 7,
      left: 0,
      width: '36%',
      height: 7,
      label: ' Brief ',
      tags: true,
      border: 'line',
      style: { border: { fg: '#5f87ff' } },
      content: renderDraft(this.state),
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
    })
    this.briefBox.on('click', () => this.focusInput())

    this.historyBox = blessed.list({
      parent: this.screen,
      top: 14,
      left: 0,
      width: '36%',
      bottom: 3,
      label: ' Session History ',
      border: 'line',
      keys: true,
      vi: true,
      mouse: true,
      style: {
        border: { fg: '#5f87ff' },
        selected: { bg: '#2f3545' },
      },
      items: ['No decisions yet'],
    })
    this.historyBox.on('click', () => this.historyBox.focus())

    this.outputBox = blessed.box({
      parent: this.screen,
      top: 2,
      left: '36%',
      width: '64%',
      bottom: 3,
      label: ' Output ',
      border: 'line',
      style: { border: { fg: '#5f87ff' } },
      scrollable: true,
      alwaysScroll: true,
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      content: renderResult(this.state),
    })
    this.outputBox.on('click', () => this.outputBox.focus())

    this.footer = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      tags: true,
      style: { fg: '#d7d7d7', bg: '#1f2736' },
      content: this.renderFooterContent(),
    })

    this.bindKeys()
    this.render()
    this.focusInput()
  }

  private makeProvider(mode: 'openai' | 'heuristic'): LlmProvider {
    return mode === 'openai' ? createOpenAiProvider() : new HeuristicDebateProvider()
  }

  private renderFooterContent(): string {
    return ` ${this.state.statusMessage}\n ${this.state.commandHint} `
  }

  private setStatus(value: string): void {
    this.state.statusMessage = value
    this.footer.setContent(this.renderFooterContent())
  }

  private focusInput(): void {
    this.inputBox.focus()
    this.beginInputCapture()
  }

  private beginInputCapture(): void {
    if (this.isReadingInput) {
      return
    }
    this.isReadingInput = true
    this.inputBox.readInput((_error, value) => {
      this.isReadingInput = false
      if (typeof value === 'string') {
        this.inputBox.setValue(value)
      }
    })
  }

  private log(message: string): void {
    this.state.logs = [...this.state.logs.slice(-40), message]
    this.setStatus(message)
  }

  private updateHistory(): void {
    if (this.state.history.length === 0) {
      this.historyBox.setItems(['No decisions yet'])
      this.state.selectedHistoryIndex = 0
      return
    }

    this.historyBox.setItems(this.state.history.map(renderHistoryLabel))
    const safeIndex = Math.min(this.state.selectedHistoryIndex, this.state.history.length - 1)
    this.state.selectedHistoryIndex = Math.max(safeIndex, 0)
    this.historyBox.select(this.state.selectedHistoryIndex)
  }

  private render(): void {
    this.briefBox.setContent(renderDraft(this.state))
    this.outputBox.setContent(renderResult(this.state))
    this.footer.setContent(this.renderFooterContent())
    this.updateHistory()
    this.screen.render()
  }

  private async runCurrentInput(): Promise<void> {
    if (this.state.runState === 'running') {
      return
    }

    const prompt = this.inputBox.getValue().trim()
    if (!prompt) {
      this.setStatus('Type a prompt first.')
      this.render()
      return
    }

    const input = buildInputFromSituation(prompt)
    this.state.currentInput = input
    this.state.runState = 'running'
    this.log(`Running decision in ${this.state.mode.toUpperCase()} mode...`)
    this.setStatus('Running...')
    this.render()

    try {
      const run = await runDecisionPipeline(input, this.session, (message) => this.log(message))
      const recordDecision = run.result.record?.executiveDecision.decision ?? 'unknown'
      this.state.currentResult = run.result
      this.state.history = [
        {
          createdAt: new Date().toISOString(),
          decisionId: run.decisionId,
          title: input.title,
          decision: recordDecision,
          artifactPath: run.artifactPath,
          input,
          result: run.result,
        },
        ...this.state.history,
      ].slice(0, 50)
      this.state.selectedHistoryIndex = 0
      this.state.runState = 'done'
      this.setStatus(`Done. ${recordDecision.toUpperCase()}  |  Artifact: ${run.artifactPath}`)
    } catch (error) {
      this.state.runState = 'error'
      const message = error instanceof Error ? error.message : String(error)
      this.log(`Error: ${message}`)
      this.setStatus(`Error: ${message}`)
    }

    this.render()
    this.focusInput()
  }

  private rerunSelectedWithEdits(): void {
    const item = this.state.history[this.state.selectedHistoryIndex]
    if (!item) {
      this.setStatus('No history item selected.')
      this.render()
      return
    }

    this.inputBox.setValue(item.input.context)
    this.state.currentInput = item.input
    this.setStatus('Loaded previous prompt. Edit it and press Enter to rerun.')
    this.render()
    this.focusInput()
  }

  private openGuidedEdit(): void {
    const base = this.state.currentInput
    const template = `${base ? base.context : this.inputBox.getValue().trim()} goals: <comma separated>; constraints: <comma separated>`

    this.inputBox.setValue(template)
    this.setStatus('Guided edit inserted. Fill hints and press Enter.')
    this.render()
    this.focusInput()
  }

  private bindKeys(): void {
    this.screen.key(['q', 'C-c'], () => {
      this.screen.destroy()
      process.exit(0)
    })

    this.screen.key(['i'], () => {
      this.setStatus('Input focused.')
      this.focusInput()
      this.render()
    })

    this.screen.key(['a'], () => {
      this.state.showAudit = !this.state.showAudit
      this.setStatus(`Audit ${this.state.showAudit ? 'shown' : 'hidden'}.`)
      this.render()
    })

    this.screen.key(['d'], () => {
      this.state.showDetails = !this.state.showDetails
      this.setStatus(`Details ${this.state.showDetails ? 'shown' : 'hidden'}.`)
      this.render()
    })

    this.screen.key(['m'], () => {
      if (!process.env.OPENAI_API_KEY) {
        this.setStatus('OPENAI_API_KEY missing. Heuristic mode only.')
        this.render()
        return
      }

      const next = this.state.mode === 'openai' ? 'heuristic' : 'openai'
      this.state.mode = next
      this.session.provider = this.makeProvider(next)
      this.setStatus(`Mode switched to ${next.toUpperCase()}.`)
      this.render()
    })

    this.screen.key(['e'], () => this.openGuidedEdit())
    this.screen.key(['r'], () => this.rerunSelectedWithEdits())

    this.screen.key(['['], () => {
      if (this.state.history.length === 0) {
        return
      }
      this.state.selectedHistoryIndex = Math.min(
        this.state.history.length - 1,
        this.state.selectedHistoryIndex + 1
      )
      this.setStatus('History selection moved down.')
      this.render()
    })

    this.screen.key([']'], () => {
      if (this.state.history.length === 0) {
        return
      }
      this.state.selectedHistoryIndex = Math.max(0, this.state.selectedHistoryIndex - 1)
      this.setStatus('History selection moved up.')
      this.render()
    })

    this.screen.key(['tab'], () => {
      if (this.screen.focused === this.inputBox) {
        this.historyBox.focus()
      } else if (this.screen.focused === this.historyBox) {
        this.outputBox.focus()
      } else {
        this.focusInput()
      }
      this.setStatus('Focus changed.')
      this.render()
    })
  }

  run(): void {
    this.render()
  }
}

export const runTui = async (): Promise<void> => {
  const app = new DecisionTuiApp()
  app.run()
}
