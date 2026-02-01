import {
  ConvergenceOutputSchema,
  CritiqueOutputSchema,
  ProposalOutputSchema,
} from "./schemas"
import {
  ConvergenceOutput,
  CritiqueOutput,
  ProposalOutput,
} from "./types"

export const parseProposalOutput = (value: unknown): ProposalOutput =>
  ProposalOutputSchema.parse(value)

export const parseCritiqueOutput = (value: unknown): CritiqueOutput =>
  CritiqueOutputSchema.parse(value)

export const parseConvergenceOutput = (value: unknown): ConvergenceOutput =>
  ConvergenceOutputSchema.parse(value)
