import { z } from "zod"
import { BadRequestError, NotFoundError } from "../core"
import { ApiResponse } from "./http"
import { createDecision, getDecision } from "./service"
import {
  CreateDecisionRequest,
  CreateDecisionResponse,
  ErrorResponse,
  GetDecisionResponse,
} from "./types"

const toErrorResponse = (error: unknown): ApiResponse<ErrorResponse> => {
  if (error instanceof NotFoundError) {
    return {
      status: 404,
      body: { error: error.message, code: "not_found" },
    }
  }
  if (error instanceof BadRequestError || error instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: error.message, code: "bad_request" },
    }
  }
  return {
    status: 500,
    body: { error: "Internal error", code: "internal_error" },
  }
}

export const handleCreateDecision = async (
  body: unknown,
  context: Parameters<typeof createDecision>[1]
): Promise<ApiResponse<CreateDecisionResponse | ErrorResponse>> => {
  try {
    const response = await createDecision(body as CreateDecisionRequest, context)
    return { status: 201, body: response }
  } catch (error) {
    return toErrorResponse(error)
  }
}

export const handleGetDecision = async (
  decisionId: string,
  context: Parameters<typeof getDecision>[1]
): Promise<ApiResponse<GetDecisionResponse | ErrorResponse>> => {
  try {
    const response = await getDecision(decisionId, context)
    return { status: 200, body: response }
  } catch (error) {
    return toErrorResponse(error)
  }
}
