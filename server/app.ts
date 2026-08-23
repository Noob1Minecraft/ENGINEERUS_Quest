import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { ServerEnv } from "./config/env";
import { createHealthRouter } from "./routes/health";
import { createSupabaseAccessTokenVerifier } from "./auth/supabaseJwt";
import { createRequireAuth } from "./middleware/requireAuth";
import { createAuthenticatedRateLimit } from "./middleware/authenticatedRateLimit";
import { createMeRouter } from "./routes/me";
import { createProfilesRouter } from "./routes/profiles";
import { createProfileRepository } from "./persistence/profiles";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://engineerus-quest.vercel.app",
  "https://engineerus-quest-git-main-enginnerus.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

export function createApp(env: ServerEnv): Express {
  const app = express();
  const configuredOrigins = env.FRONTEND_ORIGIN
    ? env.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim())
    : [];
  const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]);

  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  }));
  app.use(createHealthRouter());
  const authenticate = createRequireAuth(createSupabaseAccessTokenVerifier(env));
  const rateLimiter = createAuthenticatedRateLimit();
  const profiles = createProfileRepository(env);
  app.use(createMeRouter(authenticate, rateLimiter, profiles.loadCanonicalUser));
  app.use(createProfilesRouter(authenticate, rateLimiter, profiles));

  return app;
}
