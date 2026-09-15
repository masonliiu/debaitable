#!/usr/bin/env node

const args = process.argv.slice(2)

if (args[0] === 'eval-compare') {
  const { runEvaluationCli } = await import('../evaluation/consensus-comparison')
  try {
    await runEvaluationCli(args.slice(1))
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 2
  }
} else if (args[0] === 'serve') {
  const { runServe } = await import('./serve')
  try {
    await runServe(args.slice(1))
  } catch (error: unknown) {
    console.error('serve failed', error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
} else {
  const { runTui } = await import('./tui')

  runTui().catch((error: unknown) => {
    console.error('CLI failed', error)
    process.exitCode = 1
  })
}

// Keep this executable a module so top-level dynamic imports work under the
// strict TypeScript configuration used by the package.
export {}
