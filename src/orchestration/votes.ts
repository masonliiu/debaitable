import { ConvergenceOutput, ConsensusStrategy } from "./types"

export type VoteTally = {
  support: number
  conditional: number
  oppose: number
}

/**
 * Tally votes using equal weighting (one role = one vote, regardless of
 * confidence). This is the default strategy.
 */
export const tallyVotesEqual = (outputs: ConvergenceOutput[]): VoteTally =>
  outputs.reduce(
    (tally, output) => ({
      ...tally,
      [output.vote]: tally[output.vote] + 1,
    }),
    { support: 0, conditional: 0, oppose: 0 }
  )

/**
 * Tally votes using confidence-weighted sums. Each role's contribution to a
 * vote bucket is multiplied by its `confidence` value (defaulting to 1 when
 * absent). The resulting tallies are floating-point weights, not raw counts.
 */
export const tallyVotesWeighted = (outputs: ConvergenceOutput[]): VoteTally =>
  outputs.reduce(
    (tally, output) => {
      const weight = output.confidence !== undefined ? output.confidence : 1
      return {
        ...tally,
        [output.vote]: tally[output.vote] + weight,
      }
    },
    { support: 0, conditional: 0, oppose: 0 }
  )

/**
 * Unified entry point. Delegates to the appropriate strategy implementation.
 * Defaults to "equal" when no strategy is supplied.
 */
export const tallyVotes = (
  outputs: ConvergenceOutput[],
  strategy: ConsensusStrategy = "equal"
): VoteTally =>
  strategy === "confidence-weighted"
    ? tallyVotesWeighted(outputs)
    : tallyVotesEqual(outputs)

export const formatVoteTally = (tally: VoteTally): string =>
  JSON.stringify(tally, null, 2)
