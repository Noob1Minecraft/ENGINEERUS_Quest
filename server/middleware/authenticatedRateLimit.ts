import { ipKeyGenerator, rateLimit, type Options } from "express-rate-limit";
import type { RequestHandler } from "express";
import type { AiCapacityStore, RateLimitStoreFactory } from "../security/securityControlStore";

const WINDOW_MS = 15 * 60 * 1000;

function storeOptions(factory: RateLimitStoreFactory | undefined, namespace: string) {
  return factory ? { store: factory.create(namespace) } : {};
}

function handler(code: string, message: string): Options["handler"] {
  return (_request, response) => response.status(429).json({ error: { code, message } });
}

export function createPreAuthRateLimit(factory?: RateLimitStoreFactory, limit = 600) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (request) => ipKeyGenerator(request.ip),
    handler: handler("pre_auth_rate_limit_exceeded", "Too many API requests. Try again later."),
    ...storeOptions(factory, "pre-auth"),
  });
}

export function createAuthenticatedRateLimit(factory?: RateLimitStoreFactory) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: handler("rate_limit_exceeded", "Too many requests. Try again later."),
    ...storeOptions(factory, "authenticated-general"),
  });
}

export function createAiRateLimit(factory?: RateLimitStoreFactory, limit = 20) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: handler("ai_rate_limit_exceeded", "AI request budget exceeded. Try again later."),
    ...storeOptions(factory, "authenticated-ai"),
  });
}

export function createAiConcurrencyGuard(store: AiCapacityStore): RequestHandler {
  return (request, response, next) => {
    const userId = response.locals.auth.userId as string;
    void store.tryAcquire(userId, { maxPerUser: 1, maxGlobal: 8, leaseMs: 2 * 60 * 1000 })
      .then((lease) => {
        if (!lease) {
          response.setHeader("Retry-After", "2");
          response.status(429).json({
            error: { code: "ai_concurrency_exceeded", message: "An AI request is already in progress. Try again shortly." },
          });
          return;
        }
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          void lease.release();
        };
        response.once("finish", release);
        response.once("close", release);
        next();
      })
      .catch(next);
  };
}

export function createEngiMatchRateLimit(factory?: RateLimitStoreFactory) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: handler("engimatch_rate_limit_exceeded", "Too many matching requests. Try again later."),
    ...storeOptions(factory, "authenticated-engimatch"),
  });
}

export function createDocumentUploadRateLimit(factory?: RateLimitStoreFactory, limit = 10) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: handler("document_upload_rate_limit_exceeded", "Too many document uploads. Try again later."),
    ...storeOptions(factory, "authenticated-document-upload"),
  });
}

export function createImageUploadRateLimit(factory?: RateLimitStoreFactory, limit = 10) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: handler("image_upload_rate_limit_exceeded", "Too many image uploads. Try again later."),
    ...storeOptions(factory, "authenticated-image-upload"),
  });
}

export function createVisionAiRateLimit(factory?: RateLimitStoreFactory, limit = 10) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    skip: (request) => !Array.isArray(request.body?.image_ids) || request.body.image_ids.length === 0,
    handler: handler("vision_rate_limit_exceeded", "Vision request budget exceeded. Try again later."),
    ...storeOptions(factory, "authenticated-ai-vision"),
  });
}

export function createDirectChatReadRateLimit(factory?: RateLimitStoreFactory) {
  return rateLimit({
    windowMs: WINDOW_MS, limit: 180, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: handler("direct_chat_read_rate_limit_exceeded", "Too many messaging refreshes. Try again later."),
    ...storeOptions(factory, "authenticated-direct-chat-read"),
  });
}

export function createDirectChatCreateRateLimit(factory?: RateLimitStoreFactory) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: handler("direct_chat_create_rate_limit_exceeded", "Too many new conversation requests. Try again later."),
    ...storeOptions(factory, "authenticated-direct-chat-create"),
  });
}

export function createDirectChatWriteRateLimit(factory?: RateLimitStoreFactory) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, limit: 90, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: (_request, response) => response.locals.auth.userId,
    handler: handler("direct_chat_write_rate_limit_exceeded", "Too many messaging actions. Try again later."),
    ...storeOptions(factory, "authenticated-direct-chat-write"),
  });
}
