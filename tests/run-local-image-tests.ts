import { spawnSync } from "node:child_process";
import path from "node:path";

const supabaseCli = path.resolve("node_modules", "supabase", "dist", "supabase.js");
const status = spawnSync(process.execPath, [supabaseCli, "status", "-o", "env"], {
  encoding: "utf8",
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
});
if (status.status !== 0) {
  process.stderr.write("Local Supabase is unavailable.\n");
  process.exit(status.status ?? 1);
}
const values = new Map<string, string>();
for (const line of status.stdout.split(/\r?\n/u)) {
  const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/u);
  if (match) values.set(match[1], match[2].replace(/"$/u, ""));
}
const apiUrl = values.get("API_URL");
const publishableKey = values.get("PUBLISHABLE_KEY") || values.get("ANON_KEY");
const secretKey = values.get("SECRET_KEY") || values.get("SERVICE_ROLE_KEY");
if (!apiUrl || !publishableKey || !secretKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/iu.test(apiUrl)) {
  process.stderr.write("Safe local image test configuration is unavailable.\n");
  process.exit(1);
}
const tsxCli = path.resolve("node_modules", "tsx", "dist", "cli.mjs");
const result = spawnSync(process.execPath, [tsxCli, "--test", path.resolve("tests", "integration", "images.test.ts")], {
  stdio: "inherit",
  env: { ...process.env, TEST_SUPABASE_URL: apiUrl, TEST_SUPABASE_PUBLISHABLE_KEY: publishableKey, TEST_SUPABASE_SECRET_KEY: secretKey },
});
process.exit(result.status ?? 1);
