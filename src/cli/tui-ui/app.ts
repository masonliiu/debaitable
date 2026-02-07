import blessed from 'blessed'
import { chmod, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createOpenAiProvider, HeuristicDebateProvider, LlmProvider } from '../../ai'
import { roleDefinitions } from '../../core'
import { MemoryDecisionQueue } from '../../jobs'
import { MemoryDecisionStore } from '../../persistence'
import { buildInputFromSituation } from './input-parser'
import { runDecisionPipeline, TuiSessionContext } from './runner'
import { createInitialState, SessionHistoryItem, TuiState } from './state'

const BRAND_ASCII = [
  ' ____  _____ ____    _    ___ _____  _    ____  _     _____ ',
  '|  _ \\| ____| __ )  / \\  |_ _|_   _|/ \\  | __ )| |   | ____|',
  "| | | |  _| |  _ \\ / _ \\  | |  | | / _ \\ |  _ \\| |   |  _|  ",
  '| |_| | |___| |_) / ___ \\ | |  | |/ ___ \\| |_) | |___| |___ ',
  '|____/|_____|____/_/   \\_\\___| |_/_/   \\_\\____/|_____|_____|',
].join('\n')

const THEME = {
  bg: '#16142a',
  panelBg: '#211a3f',
  panelBorder: '#8a73ff',
  focusBorder: '#ffffff',
  brandFg: '#b8a7ff',
  primaryText: '#efeaff',
  secondaryText: '#cfc5f4',
  selectedBg: '#ffffff',
  selectedFg: '#18142a',
} as const

const trimForLine = (value: string, max = 80): string =>
  value.length <= max ? value : `${value.slice(0, max - 3)}...`

const CONTEXT_TIP =
  'Include context, goals, constraints, budget, timeline, and must-not-fail risks.'

const ENV_FILE_PATH = path.resolve(process.cwd(), '.env')
const SESSION_FILE_PATH = path.resolve(process.cwd(), '.debaitable-session.json')

const upsertEnvLine = (source: string, key: string, value: string): string => {
  const safeValue = value.replace(/\r?\n/g, '').trim()
  const lines = source.length > 0 ? source.split(/\r?\n/) : []
  const prefix = `${key}=`
  let found = false
  const updated = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true
      return `${prefix}${safeValue}`
    }
    return line
  })

  if (!found) {
    updated.push(`${prefix}${safeValue}`)
  }

  return `${updated.filter((line) => line.length > 0).join('\n')}\n`
}

const hydrateEnvFromFile = async (): Promise<void> => {
  let source = ''
  try {
    source = await readFile(ENV_FILE_PATH, 'utf8')
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
    return
  }

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const equalIndex = line.indexOf('=')
    if (equalIndex <= 0) {
      continue
    }

    const key = line.slice(0, equalIndex).trim()
    let value = line.slice(equalIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

const persistOpenAiEnv = async (apiKey: string): Promise<void> => {
  let current = ''
  try {
    current = await readFile(ENV_FILE_PATH, 'utf8')
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
  }

  let next = upsertEnvLine(current, 'OPENAI_API_KEY', apiKey)
  next = upsertEnvLine(next, 'OPENAI_MODEL', process.env.OPENAI_MODEL?.trim() || 'gpt-5')
  await writeFile(ENV_FILE_PATH, next, 'utf8')
  await chmod(ENV_FILE_PATH, 0o600)
}

const loadPersistedHistory = async (): Promise<SessionHistoryItem[]> => {
  let source = ''
  try {
    source = await readFile(SESSION_FILE_PATH, 'utf8')
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
    return []
  }

  try {
    const parsed = JSON.parse(source)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed as SessionHistoryItem[]
  } catch {
    return []
  }
}

const persistHistory = async (history: SessionHistoryItem[]): Promise<void> => {
  await writeFile(SESSION_FILE_PATH, `${JSON.stringify(history, null, 2)}\n`, 'utf8')
}

const ensureOpenAiApiKey = async (): Promise<void> => {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return
  }

  const apiKey = (
    await promptHiddenInput(
      'OPENAI_API_KEY not found. Paste key to enable OpenAI mode (or press Enter to skip): '
    )
  ).trim()

  if (!apiKey) {
    return
  }

  process.env.OPENAI_API_KEY = apiKey
  process.env.OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-5'
  await persistOpenAiEnv(apiKey)
  console.log('Saved OPENAI_API_KEY to .env')
}

const promptHiddenInput = async (label: string): Promise<string> => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return ''
  }

  process.stdout.write(label)
  const stdin = process.stdin
  const wasRaw = stdin.isRaw
  stdin.setEncoding('utf8')
  if (typeof stdin.setRawMode === 'function') {
    stdin.setRawMode(true)
  }
  stdin.resume()

  return new Promise((resolve, reject) => {
    let value = ''

    const cleanup = (): void => {
      stdin.off('data', onData)
      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(Boolean(wasRaw))
      }
      stdin.pause()
      process.stdout.write('\n')
    }

    const onData = (chunk: string): void => {
      if (chunk === '\u0003') {
        cleanup()
        reject(new Error('Input cancelled'))
        return
      }

      if (chunk === '\r' || chunk === '\n') {
        cleanup()
        resolve(value)
        return
      }

      if (chunk === '\u007f' || chunk === '\b') {
        if (value.length > 0) {
          value = value.slice(0, -1)
        }
        return
      }

      if (chunk.startsWith('\u001b')) {
        return
      }

      value += chunk
      process.stdout.write('*')
    }

    stdin.on('data', onData)
  })
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
  lines.push(`Decision Criteria: ${record.executiveDecision.stopGoCriteria}`)
  lines.push('Reasoning:')
  let reasoningIndex = 1
  for (const item of record.executiveDecision.why) {
    lines.push(`${reasoningIndex}. ${item}`)
    reasoningIndex += 1
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
  private inputBox: blessed.Widgets.TextareaElement
  private tipBox: blessed.Widgets.BoxElement
  private outputBox: blessed.Widgets.BoxElement
  private historyBox: blessed.Widgets.ListElement
  private helpModal: blessed.Widgets.BoxElement
  private footer: blessed.Widgets.BoxElement
  private loadingTimer: NodeJS.Timeout | null = null
  private loadingFrame = 0
  private historyTopUpPrimed = false
  private suppressFocusHighlight = false
  private state: TuiState
  private session: TuiSessionContext

  constructor(history: SessionHistoryItem[]) {
    const defaultMode: 'openai' | 'heuristic' = process.env.OPENAI_API_KEY ? 'openai' : 'heuristic'
    this.state = createInitialState(defaultMode)
    this.state.history = history

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
      content: `${BRAND_ASCII}\nMake specialized, trained LLMs debate to achieve a refined consensus.`,
    })

    this.inputBox = blessed.textarea({
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
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { ch: ' ' },
      wrap: true,
    })
    this.inputBox.key(['enter'], () => {
      void this.runCurrentInput()
      return false
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
      bottom: 5,
      label: ' Session History ',
      border: 'line',
      keys: true,
      vi: true,
      mouse: true,
      style: {
        border: { fg: THEME.panelBorder },
        fg: THEME.primaryText,
        bg: THEME.bg,
        selected: { bg: THEME.selectedBg, fg: THEME.selectedFg },
      },
      items: ['No decisions yet'],
    })

    this.outputBox = blessed.box({
      parent: this.screen,
      top: 7,
      left: '34%',
      width: '66%',
      bottom: 5,
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

    this.helpModal = blessed.box({
      parent: this.screen,
      width: '58%',
      height: 10,
      top: 'center',
      left: 'center',
      label: ' Help ',
      border: 'line',
      tags: true,
      hidden: true,
      style: {
        border: { fg: THEME.focusBorder },
        fg: THEME.primaryText,
        bg: THEME.panelBg,
      },
      content: [
        ' Core controls',
        ' [Enter] Run decision',
        ' [Arrows] Move between prompt, history, and output',
        ' [A] Toggle audit timeline',
        ' [M] Toggle model (if OPENAI_API_KEY exists)',
        ' [Q] Quit  [Ctrl+C] Force quit',
        ' [?] Toggle this help',
      ].join('\n'),
    })
    this.helpModal.on('click', () => {
      this.helpModal.hide()
      this.render()
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
    this.render()
    this.focusInput()
  }

  private makeProvider(mode: 'openai' | 'heuristic'): LlmProvider {
    return mode === 'openai' ? createOpenAiProvider() : new HeuristicDebateProvider()
  }

  private isTypingInPrompt(): boolean {
    return this.screen.focused === this.inputBox
  }

  private stopPromptEditing(): void {
    ;(this.inputBox as unknown as { cancel?: () => void }).cancel?.()
  }

  private focusHistory(): void {
    this.stopPromptEditing()
    this.suppressFocusHighlight = false
    this.historyTopUpPrimed = false
    this.historyBox.focus()
    this.updateFocusStyles()
    this.screen.render()
  }

  private focusOutput(): void {
    this.stopPromptEditing()
    this.suppressFocusHighlight = false
    this.outputBox.focus()
    this.updateFocusStyles()
    this.screen.render()
  }

  private updateFocusStyles(): void {
    if (this.suppressFocusHighlight) {
      ;(this.inputBox.style as unknown as { border?: { fg?: string } }).border = {
        fg: THEME.panelBorder,
      }
      ;(this.historyBox.style as unknown as { border?: { fg?: string } }).border = {
        fg: THEME.panelBorder,
      }
      ;(this.outputBox.style as unknown as { border?: { fg?: string } }).border = {
        fg: THEME.panelBorder,
      }
      return
    }

    const focused = this.screen.focused
    ;(this.inputBox.style as unknown as { border?: { fg?: string } }).border = {
      fg: focused === this.inputBox ? THEME.focusBorder : THEME.panelBorder,
    }
    ;(this.historyBox.style as unknown as { border?: { fg?: string } }).border = {
      fg: focused === this.historyBox ? THEME.focusBorder : THEME.panelBorder,
    }
    ;(this.outputBox.style as unknown as { border?: { fg?: string } }).border = {
      fg: focused === this.outputBox ? THEME.focusBorder : THEME.panelBorder,
    }
  }

  private renderFooterContent(): string {
    const mode = this.state.mode.toUpperCase()
    return [
      ` Status: ${this.state.statusMessage} | Mode: ${mode}`,
      ' [?] Help  [Q] Quit',
    ].join('\n')
  }

  private setStatus(value: string): void {
    this.state.statusMessage = value
    this.footer.setContent(this.renderFooterContent())
  }

  private focusInput(): void {
    this.suppressFocusHighlight = false
    if (this.screen.focused !== this.inputBox) {
      this.inputBox.focus()
    }
    this.updateFocusStyles()
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
    if (this.state.runState === 'running') {
      this.outputBox.setContent(this.renderLoadingOutput())
    } else {
      this.outputBox.setContent(renderResult(this.state))
    }
    this.footer.setContent(this.renderFooterContent())
    this.updateHistory()
    this.updateFocusStyles()
    this.screen.render()
  }

  private renderLoadingOutput(): string {
    const dots = '.'.repeat((this.loadingFrame % 4) + 1).padEnd(4, ' ')
    const spinner = ['|', '/', '-', '\\'][this.loadingFrame % 4]
    return [
      `{bold}${spinner} Running debate {dots}{/bold}`,
    ].join('\n')
  }

  private startLoadingAnimation(): void {
    if (this.loadingTimer) {
      return
    }
    this.loadingTimer = setInterval(() => {
      if (this.state.runState !== 'running') {
        return
      }
      this.loadingFrame += 1
      this.outputBox.setContent(this.renderLoadingOutput())
      this.screen.render()
    }, 180)
  }

  private stopLoadingAnimation(): void {
    if (!this.loadingTimer) {
      return
    }
    clearInterval(this.loadingTimer)
    this.loadingTimer = null
    this.loadingFrame = 0
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
    this.startLoadingAnimation()
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
      await persistHistory(this.state.history)
      this.state.selectedHistoryIndex = 0
      this.state.runState = 'done'
      this.setStatus(`Done. ${recordDecision.toUpperCase()} | ${run.artifactPath}`)
    } catch (error) {
      this.state.runState = 'error'
      const message = error instanceof Error ? error.message : String(error)
      this.log(`Error: ${message}`)
      this.setStatus(`Error: ${message}`)
    } finally {
      this.stopLoadingAnimation()
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
    this.screen.key(['?'], () => {
      this.helpModal.hidden = !this.helpModal.hidden
      if (this.helpModal.hidden) {
        this.focusInput()
      }
      this.screen.render()
    })

    this.screen.key(['escape'], () => {
      if (!this.helpModal.hidden) {
        this.helpModal.hide()
        this.render()
        return
      }
      this.stopPromptEditing()
      this.suppressFocusHighlight = true
      this.updateFocusStyles()
      this.screen.render()
    })

    this.screen.on('mouse', (data: blessed.Widgets.Events.IMouseEventArg) => {
      if (this.helpModal.hidden || data.action !== 'mousedown') {
        return
      }
      const lpos = this.helpModal.lpos
      if (!lpos) {
        return
      }
      const outsideX = data.x < lpos.xi || data.x > lpos.xl
      const outsideY = data.y < lpos.yi || data.y > lpos.yl
      if (outsideX || outsideY) {
        this.helpModal.hide()
        this.render()
      }
    })

    this.screen.key(['q'], () => {
      if (this.isTypingInPrompt()) {
        return
      }
      this.screen.destroy()
      process.exit(0)
    })

    this.screen.key(['enter'], () => {
      if (!this.helpModal.hidden || !this.isTypingInPrompt()) {
        return
      }
      void this.runCurrentInput()
    })

    this.screen.key(['C-c'], () => {
      this.screen.destroy()
      process.exit(0)
    })

    this.inputBox.key(['down'], () => {
      this.focusHistory()
      return false
    })

    this.inputBox.key(['right'], () => {
      this.focusOutput()
      return false
    })

    this.historyBox.key(['up'], () => {
      const selectedIndex = this.getHistorySelectionIndex()
      if (selectedIndex === 0) {
        if (!this.historyTopUpPrimed) {
          this.historyTopUpPrimed = true
          this.render()
          return false
        }
        this.historyTopUpPrimed = false
        this.focusInput()
        return false
      }
      this.historyTopUpPrimed = false
      return true
    })

    this.historyBox.key(['down'], () => {
      this.historyTopUpPrimed = false
      return true
    })

    this.historyBox.key(['right'], () => {
      this.focusOutput()
      return false
    })

    this.historyBox.key(['enter'], () => {
      this.rerunSelectedWithEdits()
      return false
    })

    this.outputBox.key(['left'], () => {
      this.focusHistory()
      return false
    })

    this.screen.key(['a'], () => {
      if (this.isTypingInPrompt()) {
        return
      }
      this.state.showAudit = !this.state.showAudit
      this.setStatus(`Audit ${this.state.showAudit ? 'shown' : 'hidden'}.`)
      this.render()
    })

    this.screen.key(['m'], () => {
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
  }

  run(): void {
    this.render()
  }
}

export const runTui = async (): Promise<void> => {
  await hydrateEnvFromFile()
  await ensureOpenAiApiKey()
  const history = await loadPersistedHistory()
  const app = new DecisionTuiApp(history)
  app.run()
}
