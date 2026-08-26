import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const workflow = readFileSync(path.resolve(".github/workflows/security.yml"), "utf8");
const manifest = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as { scripts: Record<string, string> };

test("security workflow is least privilege and contains the required non-deployment gates", () => {
  assert.match(workflow, /^permissions:\s*\n\s+contents: read/mu);
  assert.doesNotMatch(workflow, /(?:contents|packages|deployments|pull-requests): write/u);
  assert.doesNotMatch(workflow, /pull_request_target/u);
  assert.doesNotMatch(workflow, /npm publish|git push|supabase db push|vercel deploy|render deploy/iu);
  for (const required of ["npm ci", "npm run typecheck", "npm run build", "npm run test:security", "npm audit --omit=dev --audit-level=critical", "npm sbom --sbom-format cyclonedx --omit dev"]) {
    assert.match(workflow, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
  assert.match(workflow, /gitleaks\/gitleaks-action@[0-9a-f]{40}/u);
  assert.match(workflow, /persist-credentials: false/u);
});

test("security commands keep Docker database checks separate from fast CI", () => {
  assert.match(manifest.scripts["test:security"], /security-logging\.test\.ts/u);
  assert.match(manifest.scripts["test:security"], /security-headers\.test\.ts/u);
  assert.match(manifest.scripts["test:security"], /cors-security\.test\.ts/u);
  assert.match(manifest.scripts["test:security"], /direct-chat-api\.test\.ts/u);
  assert.equal(manifest.scripts["test:security:db"], "supabase test db");
  assert.doesNotMatch(workflow, /test:security:db|docker|supabase start/iu);
});

test("migration history is ordered and excludes destructive CI anti-patterns", () => {
  const directory = path.resolve("supabase/migrations");
  const migrations = readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
  assert.equal(new Set(migrations.map((file) => file.slice(0, 14))).size, migrations.length);
  assert.deepEqual(migrations, [...migrations].sort());
  const sql = migrations.map((file) => readFileSync(path.join(directory, file), "utf8")).join("\n");
  assert.doesNotMatch(sql, /drop\s+schema|disable\s+row\s+level\s+security|supabase_migrations\.schema_migrations|alter\s+role[^;]*password/iu);
});
