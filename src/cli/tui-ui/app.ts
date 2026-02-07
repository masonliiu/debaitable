import blessed from 'blessed'
import { createOpenAiProvider, HeuristicDebateProvider, LlmProvider } from '../../ai'
import { roleDefinitions } from '../../core'
import { MemoryDecisionQueue } from '../../jobs'
import { MemoryDecisionStore } from '../../persistence'
import { buildInputFromSituation } from './input-parser'
import { runDecisionPipeline, TuiSessionContext } from './runner'
import { createInitialState, SessionHistoryItem, TuiState } from './state'

const BRAND_ASCII = [
  ' ____  _____ ____    _    ___ _____ _   _    _    ____  _     _____ ',
  '|  _ \\| ____| __ )  / \\  |_ _|_   _| | | |  / \\  | __ )| |   | ____|',
  "| | | |  _| |  _ \\ / _ \\  | |  | | | |_| | / _ \\ |  _ \\| |   |  _|  ",
  '| |_| | |___| |_) / ___ \\ | |  | | |  _  |/ ___ \\| |_) | |___| |___ ',
  '|____/|_____|____/_/   \\_\\___| |_| |_| |_/_/   \\_\\____/|_____|_____|',
].join('\n')

const THEME = {
  bg: '#16142a',
  panelBg: '#211a3f',
  panelBorder: '#8a73ff',
  brandFg: '#b8a7ff',
  primaryText: '#efeaff',
  secondaryText: '#cfc5f4',
  selectedBg: '#372d63',
} as const

const trimForLine = (value: string, max = 80): string =>
  value.length <= max ? value : `${value.slice(0, max - 3)}...`

const CONTEXT_TIP =
  'Include context, goals, constraints, budget, timeline, and must-not-fail risks.'

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
  lines.push('Top Actions:')
  for (const item of record.executiveDecision.topActions.slice(0, 4)) {
    lines.push(`- ${item}`)
  }

  if (state.showDetails) {
    lines.push('')
    lines.push('{bold}Details{/bold}')
    lines.push(`Rationale: ${record.rationale}`)
    lines.push('Top Risks:')
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
    lines.push('{gray-fg}[d] Show detailed record{/gray-fg}')
  }

  if (state.showAudit) {
    lines.push('')
    lines.push('{bold}Audit Timeline{/bold}')
    for (const round of state.currentResult.rounds) {
      lines.push(`- Round ${round.roundIndex} | ${round.roleKey}`)
    }
  } else {
    lines.push('{gray-fg}[a] Show audit timeline{/gray-fg}')
  }

  return lines.join('\n')
}

const renderHistoryLabel = (item: SessionHistoryItem): string =>
  `${item.decision.toUpperCase()} | ${trimForLine(item.title, 40)}`

class DecisionTuiApp {
  private screen: blessed.Widgets.Screen
  private inputBox: blessed.Widgets.TextboxElement
  private tipBox: blessed.Widgets.BoxElement
  private outputBox: blessed.Widgets.BoxElement
  private historyBox: blessed.Widgets.ListElement
  private footer: blessed.Widgets.BoxElement
  private state: TuiState
  private session: TuiSessionContext

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
      title: 'DebAItable TUI',
      dockBorders: true,
      fullUnicode: true,
    })

    blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 7,
      tags: true,
      style: { fg: THEME.brandFg, bg: THEME.panelBg },
      content: `${BRAND_ASCII}\nStructured debate. Defensible decisions.`,
    })

    this.inputBox = blessed.textbox({
      parent: this.screen,
      top: 7,
      left: 0,
      width: '34%',
      height: 6,
      inputOnFocus: true,
      keys: true,
      mouse: true,
      label: ' Prompt ',
      border: 'line',
      style: { border: { fg: THEME.panelBorder }, fg: THEME.primaryText, bg: THEME.bg },
      value: '',
    })
    this.inputBox.on('submit', () => {
      void this.runCurrentInput()
    })

    this.tipBox = blessed.box({
      parent: this.screen,
      top: 13,
      left: 0,
      width: '34%',
      height: 4,
      label: ' Context Tip ',
      tags: true,
      border: 'line',
      style: { border: { fg: THEME.panelBorder }, fg: THEME.primaryText, bg: THEME.bg },
      content: CONTEXT_TIP,
    })

    this.historyBox = blessed.list({
      parent: this.screen,
      top: 17,
      left: 0,
      width: '34%',
      bottom: 4,
      label: ' Session History ',
      border: 'line',
      keys: true,
      vi: true,
      mouse: true,
      style: {
        border: { fg: THEME.panelBorder },
        fg: THEME.primaryText,
        bg: THEME.bg,
        selected: { bg: THEME.selectedBg, fg: THEME.primaryText },
      },
      items: ['No decisions yet'],
    })

    this.outputBox = blessed.box({
      parent: this.screen,
      top: 7,
      left: '34%',
      width: '66%',
      bottom: 4,
      label: ' Output ',
      border: 'line',
      style: { border: { fg: THEME.panelBorder }, fg: THEME.primaryText, bg: THEME.bg },
      scrollable: true,
      alwaysScroll: true,
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      content: renderResult(this.state),
    })

    this.footer = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 4,
      tags: true,
      style: { fg: THEME.secondaryText, bg: THEME.panelBg },
      content: this.renderFooterContent(),
    })

    this.bindKeys()
    this.historyBox.on('select', (_item, index) => {
      this.state.selectedHistoryIndex = Number(index)
      this.rerunSelectedWithEdits()
    })
    this.render()
    this.focusInput()
  }

  private makeProvider(mode: 'openai' | 'heuristic'): LlmProvider {
    return mode === 'openai' ? createOpenAiProvider() : new HeuristicDebateProvider()
  }

  private isTypingInPrompt(): boolean {
    return this.screen.focused === this.inputBox
  }

  private renderFooterContent(): string {
    const mode = this.state.mode.toUpperCase()
    return [
      ` Status: ${this.state.statusMessage} | Mode: ${mode}`,
      ' [Enter] Run  [Tab] Focus  [R/Ctrl+R] Rerun  [Q/Ctrl+C] Quit',
      ' [D/A/M] or [F2/F3/F4] for details, audit, and mode',
      '',
    ].join('\n')
  }

  private setStatus(value: string): void {
    this.state.statusMessage = value
    this.footer.setContent(this.renderFooterContent())
  }

  private focusInput(): void {
    if (this.screen.focused !== this.inputBox) {
      this.inputBox.focus()
    }
    this.screen.render()
  }

  private getHistorySelectionIndex(): number {
    const rawSelected = (this.historyBox as unknown as { selected?: number }).selected
    if (typeof rawSelected === 'number' && rawSelected >= 0) {
      return Math.min(rawSelected, Math.max(this.state.history.length - 1, 0))
    }
    return this.state.selectedHistoryIndex
  }

  private log(message: string): void {
    this.state.logs = [...this.state.logs.slice(-50), message]
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
    this.tipBox.setContent(CONTEXT_TIP)
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
      this.setStatus(`Done. ${recordDecision.toUpperCase()} | ${run.artifactPath}`)
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
    this.state.selectedHistoryIndex = this.getHistorySelectionIndex()
    const item = this.state.history[this.state.selectedHistoryIndex]
    if (!item) {
      this.setStatus('No history item selected.')
      this.render()
      return
    }

    this.inputBox.setValue(item.input.context)
    this.state.currentInput = item.input
    this.setStatus('Loaded previous prompt. Edit and press Enter to rerun.')
    this.render()
    this.focusInput()
  }

  private bindKeys(): void {
    this.screen.key(['q', 'C-c'], () => {
      this.screen.destroy()
      process.exit(0)
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

    this.screen.key(['a', 'f3'], () => {
      if (this.isTypingInPrompt()) {
        return
      }
      this.state.showAudit = !this.state.showAudit
      this.setStatus(`Audit ${this.state.showAudit ? 'shown' : 'hidden'}.`)
      this.render()
    })

    this.screen.key(['d', 'f2'], () => {
      if (this.isTypingInPrompt()) {
        return
      }
      this.state.showDetails = !this.state.showDetails
      this.setStatus(`Details ${this.state.showDetails ? 'shown' : 'hidden'}.`)
      this.render()
    })

    this.screen.key(['m', 'f4'], () => {
      if (this.isTypingInPrompt()) {
        return
      }
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

    this.screen.key(['r', 'C-r'], () => {
      if (this.isTypingInPrompt()) {
        return
      }
      this.rerunSelectedWithEdits()
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
