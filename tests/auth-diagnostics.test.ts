import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("browser auth code contains no residual token or session diagnostics", () => {
  const files = ["src/auth/AuthContext.tsx", "src/utils/api.ts", "src/App.tsx"];
  const source = files.map((file) => readFileSync(path.resolve(file), "utf8")).join("\n");

  assert.doesNotMatch(source, /auth-token-trace/u);
  assert.doesNotMatch(source, /console\.(?:log|debug|info)\s*\(/u);
  assert.doesNotMatch(source, /console\.[a-z]+\s*\([^\n]*(?:access_token|refresh_token|Authorization|JWT claims)/iu);
});
