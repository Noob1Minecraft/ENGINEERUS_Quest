import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createApp } from "../server/app";
import { loadServerEnv } from "../server/config/env";
import {
  CONTENT_SECURITY_POLICY_HEADER,
  PRODUCTION_CSP_VALUE,
  createContentSecurityPolicyDirectives,
} from "../server/security/contentSecurityPolicy";
import { withServer } from "./helpers";

function normalizeCsp(value: string): string {
  return value.split(";").map((directive) => directive.trim()).filter(Boolean).join(";");
}

const env = loadServerEnv({
  NODE_ENV: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-placeholder",
  SUPABASE_SECRET_KEY: "test-secret-placeholder",
});

test("production CSP is restrictive and contains the required Engineerus origins", () => {
  const directives = createContentSecurityPolicyDirectives("production");

  assert.deepEqual(directives["default-src"], ["'self'"]);
  assert.deepEqual(directives["script-src"], ["'self'"]);
  assert.deepEqual(directives["frame-ancestors"], ["'none'"]);
  assert.deepEqual(directives["object-src"], ["'none'"]);
  assert.deepEqual(directives["base-uri"], ["'self'"]);
  assert.deepEqual(directives["form-action"], ["'self'"]);
  assert.ok(directives["connect-src"].includes("https://engineerus-quest-supabase.onrender.com"));
  assert.ok(directives["connect-src"].includes("https://api.equest.kz"));
  assert.ok(directives["connect-src"].includes("https://gsudtcyoaknehfixaxha.supabase.co"));
  assert.ok(directives["connect-src"].includes("wss://gsudtcyoaknehfixaxha.supabase.co"));
  assert.equal(PRODUCTION_CSP_VALUE.includes("groq"), false);
  assert.equal(PRODUCTION_CSP_VALUE.includes("unsafe-eval"), false);
  assert.equal(PRODUCTION_CSP_VALUE.includes("data:"), false);
  assert.equal(PRODUCTION_CSP_VALUE.includes("blob:"), false);
  assert.equal(PRODUCTION_CSP_VALUE.includes("*"), false);
  assert.deepEqual(directives["style-src"], ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(directives["img-src"], ["'self'", "https:"]);
});

test("development-only connection origins do not leak into the production policy", () => {
  const development = createContentSecurityPolicyDirectives("development")["connect-src"];
  const production = createContentSecurityPolicyDirectives("production")["connect-src"];

  assert.ok(development.includes("http://localhost:*"));
  assert.ok(development.includes("ws://localhost:*"));
  assert.equal(production.some((source) => source.includes("localhost")), false);
  assert.equal(production.some((source) => source.includes("127.0.0.1")), false);
});

test("Express emits the CSP in Report-Only mode without weakening Helmet headers", async () => {
  await withServer(createApp(env), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal(
      normalizeCsp(response.headers.get(CONTENT_SECURITY_POLICY_HEADER) ?? ""),
      normalizeCsp(PRODUCTION_CSP_VALUE),
    );
    assert.equal(response.headers.get("content-security-policy"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-powered-by"), null);
  });
});

test("Vercel deploys the same Report-Only CSP and browser-only output directory", () => {
  const config = JSON.parse(readFileSync(path.resolve("vercel.json"), "utf8")) as {
    outputDirectory: string;
    headers: Array<{ headers: Array<{ key: string; value: string }> }>;
  };
  const csp = config.headers.flatMap((entry) => entry.headers)
    .find((header) => header.key === CONTENT_SECURITY_POLICY_HEADER);

  assert.equal(config.outputDirectory, "dist");
  assert.equal(csp?.value, PRODUCTION_CSP_VALUE);
});
