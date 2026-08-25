import type { ErrorRequestHandler } from "express";

function isMalformedJson(error: unknown): boolean {
  const candidate = error as SyntaxError & { status?: number; body?: unknown };
  return error instanceof SyntaxError
    && candidate.status === 400
    && "body" in candidate;
}

export const apiErrorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (isMalformedJson(error)) {
    response.status(400).json({
      error: { code: "invalid_json", message: "The request body must contain valid JSON." },
    });
    return;
  }

  const status = (error as { status?: unknown }).status;
  if (status === 413) {
    response.status(413).json({
      error: { code: "payload_too_large", message: "The request body is too large." },
    });
    return;
  }
  if (typeof status === "number" && status >= 400 && status < 500) {
    response.status(status).json({
      error: { code: "invalid_request", message: "The request could not be parsed." },
    });
    return;
  }

  response.status(500).json({
    error: { code: "internal_error", message: "The request could not be completed." },
  });
};
