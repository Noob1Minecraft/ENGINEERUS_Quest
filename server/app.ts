import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { ServerEnv } from "./config/env";
import { createHealthRouter } from "./routes/health";
import { createSupabaseAccessTokenVerifier } from "./auth/supabaseJwt";
import { createRequireAuth } from "./middleware/requireAuth";
import { createAuthenticatedRateLimit, createDirectChatCreateRateLimit, createDirectChatReadRateLimit, createDirectChatWriteRateLimit, createEngiMatchRateLimit, createPreAuthRateLimit } from "./middleware/authenticatedRateLimit";
import { createMeRouter } from "./routes/me";
import { createProfilesRouter } from "./routes/profiles";
import { createProfileRepository } from "./persistence/profiles";
import { createProjectRepository } from "./persistence/projects";
import { createProjectsRouter } from "./routes/projects";
import { createProjectRecruitmentRepository } from "./persistence/projectRecruitment";
import { createProjectRecruitmentRouter } from "./routes/projectRecruitment";
import { createEngiMatchRepository } from "./persistence/engimatch";
import { createEngiMatchRouter } from "./routes/engimatch";
import { createDirectChatRepository } from "./persistence/directChats";
import { createDirectChatsRouter } from "./routes/directChats";
import { createContentSecurityPolicyDirectives } from "./security/contentSecurityPolicy";
import type { RateLimitStoreFactory } from "./security/securityControlStore";
import { createRequestContext } from "./middleware/requestContext";
import { securityLogger, type StructuredLogger } from "./security/structuredLogger";
import { createBetaRepository } from "./persistence/beta";
import { createBetaRouter } from "./routes/beta";
import { createGamificationRepository } from "./persistence/gamification";
import { createGamificationRouter } from "./routes/gamification";

const DEPLOYED_ALLOWED_ORIGINS = [
  "https://engineerus-quest.vercel.app",
  "https://engineerus-quest-git-main-enginnerus.vercel.app",
  "https://engineerus-quest-git-feat-supabase-foundation-enginnerus.vercel.app",
];

const DEVELOPMENT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
];

export function createAllowedOrigins(env: ServerEnv): Set<string> {
  const configuredOrigins = env.FRONTEND_ORIGIN
    ? env.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim())
    : [];
  const developmentOrigins = env.NODE_ENV === "production" ? [] : DEVELOPMENT_ALLOWED_ORIGINS;
  const safeConfiguredOrigins = env.NODE_ENV === "production"
    ? configuredOrigins.filter((origin) => {
      const hostname = new URL(origin).hostname.toLowerCase();
      return hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]";
    })
    : configuredOrigins;
  return new Set([...DEPLOYED_ALLOWED_ORIGINS, ...developmentOrigins, ...safeConfiguredOrigins]);
}

export function createApp(env: ServerEnv, options: {
  rateLimitStoreFactory?: RateLimitStoreFactory;
  logger?: StructuredLogger;
} = {}): Express {
  const app = express();
  const allowedOrigins = createAllowedOrigins(env);
  const logger = options.logger ?? securityLogger;

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(createRequestContext(logger));
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: createContentSecurityPolicyDirectives(env.NODE_ENV),
      reportOnly: true,
    },
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      // Return no CORS headers. The browser rejects access without exposing an
      // application error body or turning CORS into an authentication control.
      callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  }));
  app.use(createHealthRouter());
  app.use("/api", createPreAuthRateLimit(options.rateLimitStoreFactory));
  const authenticate = createRequireAuth(createSupabaseAccessTokenVerifier(env));
  const rateLimiter = createAuthenticatedRateLimit(options.rateLimitStoreFactory);
  const profiles = createProfileRepository(env);
  const projects = createProjectRepository(env);
  const projectRecruitment = createProjectRecruitmentRepository(env);
  const engimatch = createEngiMatchRepository(env);
  const directChats = createDirectChatRepository(env);
  const beta = createBetaRepository(env);
  const gamification = createGamificationRepository(env);
  app.use(createMeRouter(
    authenticate,
    rateLimiter,
    profiles.loadCanonicalUser,
    profiles.recordDailyActivity,
  ));
  app.use(createProfilesRouter(authenticate, rateLimiter, profiles));
  app.use(createBetaRouter(authenticate, rateLimiter, beta));
  app.use(createGamificationRouter(authenticate, rateLimiter, gamification));
  app.use(createProjectsRouter(authenticate, rateLimiter, projects, beta.recordEvent));
  app.use(createProjectRecruitmentRouter(authenticate, rateLimiter, projectRecruitment, beta.recordEvent));
  app.use(createEngiMatchRouter(authenticate, createEngiMatchRateLimit(options.rateLimitStoreFactory), engimatch, beta.recordEvent));
  app.use(createDirectChatsRouter(
    authenticate,
    createDirectChatReadRateLimit(options.rateLimitStoreFactory),
    createDirectChatCreateRateLimit(options.rateLimitStoreFactory),
    createDirectChatWriteRateLimit(options.rateLimitStoreFactory),
    directChats,
    beta.recordEvent,
  ));

  return app;
}
