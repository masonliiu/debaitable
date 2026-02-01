import { ConvergenceOutput } from "./types"

export type VoteTally = {
  support: number
  conditional: number
  oppose: number
}

export const tallyVotes = (outputs: ConvergenceOutput[]): VoteTally =>
  outputs.reduce(
    (tally, output) => ({
      ...tally,
      [output.vote]: tally[output.vote] + 1,
    }),
    { support: 0, conditional: 0, oppose: 0 }
  )

export const formatVoteTally = (tally: VoteTally): string =>
  JSON.stringify(tally, null, 2)
