import { rateLimit } from "express-rate-limit";

export function createAuthenticatedRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: (_request, response) => {
      response.status(429).json({
        error: { code: "rate_limit_exceeded", message: "Too many requests. Try again later." },
      });
    },
  });
}
