import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from "jose";
import { loadServerEnv } from "../server/config/env";
import {
  InvalidAccessTokenError,
  createSupabaseAccessTokenVerifier,
} from "../server/auth/supabaseJwt";
import { createRequireAuth } from "../server/middleware/requireAuth";
import { createMeRouter, type CanonicalUser } from "../server/routes/me";
import { withServer } from "./helpers";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const ISSUER = "https://example.supabase.co/auth/v1";

const env = loadServerEnv({
  NODE_ENV: "test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-placeholder",
  SUPABASE_SECRET_KEY: "test-secret-placeholder",
});

async function signingFixture() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  const keySet = createLocalJWKSet({ keys: [{ ...jwk, kid: "test-key", alg: "ES256" }] });
  const sign = (subject: string, expiration: string | number = "5m") => new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setSubject(subject)
    .setIssuer(ISSUER)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(privateKey);
  return { keySet, sign };
}

test("verifies a valid Supabase JWT and derives identity from sub", async () => {
  const { keySet, sign } = await signingFixture();
  const verify = createSupabaseAccessTokenVerifier(env, keySet);
  const identity = await verify(await sign(USER_A));
  assert.equal(identity.userId, USER_A);
});

test("rejects expired and invalid Supabase JWTs", async () => {
  const { keySet, sign } = await signingFixture();
  const verify = createSupabaseAccessTokenVerifier(env, keySet);
  await assert.rejects(verify(await sign(USER_A, 0)), InvalidAccessTokenError);
  await assert.rejects(verify("not-a-jwt"), InvalidAccessTokenError);
});

test("missing Authorization header returns a generic 401", async () => {
  const app = express();
  app.get("/protected", createRequireAuth(async () => ({ userId: USER_A, claims: {} })), (_req, res) => {
    res.json({ ok: true });
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/protected`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: { code: "missing_bearer_token", message: "Authentication is required." },
    });
  });
});

test("forged client email and user ID cannot replace verified JWT sub", async () => {
  const app = express();
  app.use(express.json());
  app.post(
    "/protected",
    createRequireAuth(async () => ({ userId: USER_A, claims: { sub: USER_A } })),
    (req, res) => res.json({ owner: res.locals.auth.userId, received: req.body }),
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/protected`, {
      method: "POST",
      headers: { Authorization: "Bearer valid-test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ userId: USER_B, email: "forged@example.com" }),
    });
    const body = await response.json() as { owner: string };
    assert.equal(body.owner, USER_A);
  });
});

test("GET /api/me loads only the verified user's canonical data", async () => {
  const canonical: CanonicalUser = {
    profile: {
      id: USER_A,
      username: "engineer_a",
      display_name: "Engineer A",
      avatar_url: null,
      preferred_lang: "en",
      telegram_user_id: null,
    },
    progress: {
      total_xp: 25,
      level: 1,
      streak_days: 2,
      requests_count: 1,
      material_count: 0,
      patent_count: 0,
      modules_used: ["tutor"],
    },
  };
  let requestedUserId = "";
  let receivedToken = "";
  const authenticate = createRequireAuth(async () => ({ userId: USER_A, claims: { sub: USER_A } }));
  const noLimit: express.RequestHandler = (_req, _res, next) => next();
  const app = express();
  app.use(createMeRouter(authenticate, noLimit, async (userId, token) => {
    requestedUserId = userId;
    receivedToken = token;
    return canonical;
  }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/me?userId=${USER_B}&email=forged@example.com`, {
      headers: { Authorization: "Bearer verified-token" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), canonical);
    assert.equal(requestedUserId, USER_A);
    assert.equal(receivedToken, "verified-token");
  });
});
