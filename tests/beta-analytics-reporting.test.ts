import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildBetaAnalyticsReport, resolveBetaAnalyticsWindow, type AnalyticsReportEvent } from "../server/analytics/reporting";

const NOW = new Date("2026-09-04T12:00:00.000Z");
const users = {
  d1: "10000000-0000-4000-8000-000000000001",
  d7: "10000000-0000-4000-8000-000000000002",
  inactive: "10000000-0000-4000-8000-000000000003",
  immature: "10000000-0000-4000-8000-000000000004",
};

function event(user_id: string, event_name: string, created_at: string): AnalyticsReportEvent {
  return { user_id, event_name, created_at };
}

const fixture = [
  event(users.d1, "signup_completed", "2026-08-20T23:30:00.000Z"),
  event(users.d1, "first_meaningful_action", "2026-08-20T23:40:00.000Z"),
  event(users.d1, "ai_message_sent", "2026-08-21T00:05:00.000Z"),
  event(users.d1, "ai_message_sent", "2026-09-04T01:00:00.000Z"),
  event(users.d7, "signup_completed", "2026-08-20T01:00:00.000Z"),
  event(users.d7, "first_meaningful_action", "2026-08-21T01:00:00.000Z"),
  event(users.d7, "project_created", "2026-08-27T01:00:00.000Z"),
  event(users.inactive, "signup_completed", "2026-08-20T01:00:00.000Z"),
  event(users.inactive, "login_completed", "2026-09-04T01:00:00.000Z"),
  event(users.immature, "signup_completed", "2026-09-04T00:05:00.000Z"),
  event(users.immature, "engimatch_viewed", "2026-09-04T00:10:00.000Z"),
];

const participants = [
  { user_id: users.d1, onboarding_completed_at: "2026-08-20T23:35:00.000Z" },
  { user_id: users.d7, onboarding_completed_at: null },
  { user_id: users.inactive, onboarding_completed_at: null },
  { user_id: users.immature, onboarding_completed_at: null },
];

test("UTC reporting windows use calendar-day boundaries", () => {
  assert.deepEqual(resolveBetaAnalyticsWindow("7d", NOW), {
    fromDay: 20694,
    toDay: 20700,
    from: "2026-08-29T00:00:00.000Z",
    to: NOW.toISOString(),
  });
});

test("overview and activation math count meaningful activity only", () => {
  const report = buildBetaAnalyticsReport(fixture, participants, "all", NOW);
  assert.deepEqual(report.overview, {
    total_signups: 4,
    signups_in_range: 4,
    activated_users: 2,
    activation_rate_percent: 50,
    active_users_in_range: 2,
    dau: 1,
    wau: 1,
    mau: 2,
  });
  assert.equal(report.health.small_sample, true);
  assert.match(report.health.warning ?? "", /Small sample/u);
});

test("retention distinguishes mature zero, immature cohorts, and empty data", () => {
  const report = buildBetaAnalyticsReport(fixture, participants, "all", NOW);
  const d1 = report.retention.find((row) => row.day === 1)!;
  const d7 = report.retention.find((row) => row.day === 7)!;
  const d30 = report.retention.find((row) => row.day === 30)!;
  assert.deepEqual({ status: d1.status, eligible: d1.eligible_users, retained: d1.retained_users, rate: d1.rate_percent },
    { status: "mature", eligible: 3, retained: 1, rate: 33.33 });
  assert.deepEqual({ status: d7.status, eligible: d7.eligible_users, retained: d7.retained_users, rate: d7.rate_percent },
    { status: "mature", eligible: 3, retained: 1, rate: 33.33 });
  assert.deepEqual({ status: d30.status, eligible: d30.eligible_users, immature: d30.immature_users, rate: d30.rate_percent },
    { status: "immature_cohort", eligible: 0, immature: 4, rate: null });
  assert.equal(buildBetaAnalyticsReport([], [], "all", NOW).retention[0].status, "no_eligible_cohort");
  const zero = buildBetaAnalyticsReport([
    event(users.inactive, "signup_completed", "2026-08-01T00:00:00.000Z"),
  ], [], "all", NOW).retention[0];
  assert.deepEqual({ status: zero.status, rate: zero.rate_percent }, { status: "mature", rate: 0 });
});

test("feature adoption and funnel use deterministic aggregate counts", () => {
  const report = buildBetaAnalyticsReport(fixture, participants, "all", NOW);
  const tutor = report.features.find((feature) => feature.key === "ai_tutor")!;
  const projects = report.features.find((feature) => feature.key === "projects")!;
  const engimatch = report.features.find((feature) => feature.key === "engimatch")!;
  assert.deepEqual(tutor, { key: "ai_tutor", unique_users: 1, percent_of_signups: 25, percent_of_activated: 50, event_count: 2 });
  assert.equal(projects.unique_users, 1);
  assert.equal(engimatch.unique_users, 0, "view-only events are not meaningful adoption");
  assert.deepEqual(report.funnel, {
    onboarding_available: true,
    signups: 4,
    onboarding_completed: 1,
    activated: 2,
    retained_d1: 1,
    retained_d7: 1,
    retained_d30: 0,
  });
});

test("date ranges bound adoption without changing all-time acquisition totals", () => {
  const report = buildBetaAnalyticsReport(fixture, participants, "today", NOW);
  assert.equal(report.overview.total_signups, 4);
  assert.equal(report.overview.signups_in_range, 1);
  assert.equal(report.overview.active_users_in_range, 1);
  assert.equal(report.features.find((feature) => feature.key === "ai_tutor")!.event_count, 1);
  assert.equal(report.retention[0].status, "immature_cohort");
});

test("activation trend compares adjacent UTC signup cohorts without benchmarks", () => {
  const trendFixture = [
    event(users.inactive, "signup_completed", "2026-08-23T12:00:00.000Z"),
    event(users.immature, "signup_completed", "2026-09-01T12:00:00.000Z"),
    event(users.immature, "first_meaningful_action", "2026-09-02T12:00:00.000Z"),
  ];
  assert.equal(buildBetaAnalyticsReport(trendFixture, [], "all", NOW).health.activation_trend, "up");
  assert.equal(buildBetaAnalyticsReport([], [], "all", NOW).health.activation_trend, "insufficient_data");
});

test("report DTO and database projection exclude sensitive fields and user identities", () => {
  const report = buildBetaAnalyticsReport(fixture, participants, "all", NOW);
  const serialized = JSON.stringify(report);
  for (const forbidden of ["user_id", "email", "metadata", "prompt", "message", "token", "filename", "ip_address", "user_agent"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "iu"));
  }
  const source = readFileSync(new URL("../server/analytics/reporting.ts", import.meta.url), "utf8");
  assert.match(source, /select\("user_id,event_name,created_at"\)/u);
  assert.match(source, /select\("user_id,onboarding_completed_at"\)/u);
  assert.match(source, /if \(rows\.length > MAX_REPORT_ROWS\) unavailable\(\)/u);
  assert.match(source, /createSupabaseAdminClient\(env\)/u);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/u);
  assert.doesNotMatch(source, /select\("\*"\)|\.select\(\)/u);
});

test("reporting remains server-only until a robust admin role exists", () => {
  const app = readFileSync(new URL("../server/app.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  const docs = readFileSync(new URL("../docs/beta/BETA_ANALYTICS_REPORTING.md", import.meta.url), "utf8");
  assert.doesNotMatch(`${app}\n${server}`, /api\/admin\/analytics/u);
  assert.match(docs, /no immutable admin claim/iu);
  assert.match(docs, /not mounted as an HTTP endpoint/iu);
});

test("reporting failure remains outside normal product execution paths", () => {
  const routes = ["ai.ts", "quests.ts", "projects.ts", "engimatch.ts", "directChats.ts", "documents.ts"]
    .map((file) => readFileSync(new URL(`../server/routes/${file}`, import.meta.url), "utf8"))
    .join("\n");
  assert.doesNotMatch(routes, /createBetaAnalyticsReportingService|buildBetaAnalyticsReport/u);
});
