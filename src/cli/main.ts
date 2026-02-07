#!/usr/bin/env node

import { runTui } from './tui'

runTui().catch((error: unknown) => {
  console.error('CLI failed', error)
  process.exitCode = 1
})
