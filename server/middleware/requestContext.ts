import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { runWithRequestId, securityLogger, type StructuredLogger } from "../security/structuredLogger";

export const REQUEST_ID_HEADER = "X-Request-ID";

export function createRequestContext(logger: StructuredLogger = securityLogger): RequestHandler {
  return (request, response, next) => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    response.locals.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    runWithRequestId(requestId, () => {
      response.once("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        logger.info("http_request_completed", {
          method: request.method,
          route: request.route?.path ?? "unmatched",
          status: response.statusCode,
          duration_ms: Number(durationMs.toFixed(1)),
        });
      });
      next();
    });
  };
}
