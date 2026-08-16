import { spawnSync } from "node:child_process";
import path from "node:path";

const supabaseCli = path.resolve("node_modules", "supabase", "dist", "supabase.js");
const status = spawnSync(
  process.execPath,
  [supabaseCli, "status", "-o", "env"],
  { encoding: "utf8", env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" } },
);

if (status.status !== 0) {
  process.stderr.write("Local Supabase is unavailable. Start the local Docker stack before running persistence tests.\n");
  process.exit(status.status ?? 1);
}

const localValues = new Map<string, string>();
for (const line of status.stdout.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (match) localValues.set(match[1], match[2].replace(/"$/, ""));
}

const apiUrl = localValues.get("API_URL");
const publishableKey = localValues.get("PUBLISHABLE_KEY") || localValues.get("ANON_KEY");
const secretKey = localValues.get("SECRET_KEY") || localValues.get("SERVICE_ROLE_KEY");

if (!apiUrl || !publishableKey || !secretKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(apiUrl)) {
  process.stderr.write("Local Supabase status did not return a safe loopback test configuration.\n");
  process.exit(1);
}

const tsxCli = path.resolve("node_modules", "tsx", "dist", "cli.mjs");
const testFile = path.resolve("tests", "integration", "persistence.test.ts");
const result = spawnSync(process.execPath, [tsxCli, "--test", testFile], {
  stdio: "inherit",
  env: {
    ...process.env,
    TEST_SUPABASE_URL: apiUrl,
    TEST_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    TEST_SUPABASE_SECRET_KEY: secretKey,
  },
});

process.exit(result.status ?? 1);
