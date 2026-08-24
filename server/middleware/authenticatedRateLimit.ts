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

export function createEngiMatchRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: (_request, response) => response.status(429).json({
      error: { code: "engimatch_rate_limit_exceeded", message: "Too many matching requests. Try again later." },
    }),
  });
}

export function createDirectChatReadRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: (_request, response) => response.status(429).json({
      error: { code: "direct_chat_read_rate_limit_exceeded", message: "Too many messaging refreshes. Try again later." },
    }),
  });
}

export function createDirectChatCreateRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: (_request, response) => response.status(429).json({
      error: { code: "direct_chat_create_rate_limit_exceeded", message: "Too many new conversation requests. Try again later." },
    }),
  });
}

export function createDirectChatWriteRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, limit: 90, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: (_request, response) => response.status(429).json({
      error: { code: "direct_chat_write_rate_limit_exceeded", message: "Too many messaging actions. Try again later." },
    }),
  });
}
