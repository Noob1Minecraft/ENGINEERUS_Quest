import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import express, { type RequestHandler } from "express";
import {
  ANALYTICS_EVENT_NAMES,
  InvalidAnalyticsEventError,
  validateAnalyticsMetadata,
  type AnalyticsEventRecorder,
} from "../server/analytics/events";
import { trackProductEvent } from "../server/beta/trackProductEvent";
import { createMeRouter, type CanonicalUser } from "../server/routes/me";
import { withServer } from "./helpers";

const USER_ID = "e1000000-0000-4000-8000-000000000001";
const SESSION_ID = "e2000000-0000-4000-8000-000000000001";
const read = (file: string) => readFileSync(path.resolve(file), "utf8");

test("analytics taxonomy covers the documented journey without visitor tracking", () => {
  for (const event of [
    "signup_completed", "login_completed", "onboarding_completed",
    "first_meaningful_action", "ai_message_sent", "quest_completed",
    "learning_resource_opened", "project_created",
    "project_application_submitted", "project_invitation_accepted",
    "engimatch_viewed", "engimatch_action_taken", "document_uploaded",
    "image_uploaded", "direct_chat_started", "invite_link_created",
    "invite_link_opened", "invited_user_registered",
  ]) assert.ok(ANALYTICS_EVENT_NAMES.includes(event as never), event);
  assert.ok(!ANALYTICS_EVENT_NAMES.includes("page_view" as never));
});

test("event metadata is event-specific, bounded, and content-free", () => {
  assert.deepEqual(validateAnalyticsMetadata("ai_message_sent", {
    module: "tutor", language: "ru", has_document: false, image_count: 0,
  }), { module: "tutor", language: "ru", has_document: false, image_count: 0 });
  for (const metadata of [
    { prompt: "private prompt" },
    { response: "private answer" },
    { email: "person@example.test" },
    { filename: "private-spec.pdf" },
    { module: "x".repeat(121) },
    { arbitrary: "value" },
  ]) assert.throws(
    () => validateAnalyticsMetadata("ai_message_sent", metadata),
    InvalidAnalyticsEventError,
  );
});

test("analytics failures remain non-blocking and never expose event payloads", async () => {
  const failing: AnalyticsEventRecorder = async () => { throw new Error("storage offline"); };
  await assert.doesNotReject(() => trackProductEvent(
    failing, USER_ID, "ai_message_sent", { module: "tutor" }, "assistant-id",
  ));
  const tracker = read("server/beta/trackProductEvent.ts");
  assert.doesNotMatch(tracker, /securityLogger\.warn\([^;]*(?:userId|metadata|dedupeKey)/su);
});

test("login analytics derives identity and session from verified auth state", async () => {
  const calls: unknown[][] = [];
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.auth = {
      userId: USER_ID,
      accessToken: "safe-test-token",
      claims: { sub: USER_ID, session_id: SESSION_ID },
    };
    next();
  };
  const app = express();
  app.use(createMeRouter(
    authenticate,
    (_request, _response, next) => next(),
    async () => ({ profile: {}, progress: {}, completed_quests: [] }) as unknown as CanonicalUser,
    async () => ({ current_streak: 1, longest_streak: 1, last_active_date: "2026-09-04" }),
    async (...args) => { calls.push(args); },
  ));

  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/me?user_id=ffffffff-ffff-4fff-8fff-ffffffffffff`);
    assert.equal(response.status, 200);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], USER_ID);
  assert.equal(calls[0][1], "login_completed");
  assert.equal(calls[0][3], `session:${SESSION_ID}`);
  assert.deepEqual(calls[0][4], { sessionId: SESSION_ID });
});

test("highest-value events are recorded only after authoritative successful actions", () => {
  const cases = [
    ["server/routes/ai.ts", "ai_message_sent"],
    ["server/routes/quests.ts", "quest_completed"],
    ["server/routes/projects.ts", "project_created"],
    ["server/routes/projectRecruitment.ts", "project_application_submitted"],
    ["server/routes/projectRecruitment.ts", "project_invitation_accepted"],
    ["server/routes/projectRecruitment.ts", "engimatch_action_taken"],
    ["server/routes/documents.ts", "document_uploaded"],
    ["server/routes/images.ts", "image_uploaded"],
    ["server/routes/directChats.ts", "direct_chat_started"],
  ] as const;
  for (const [file, event] of cases) {
    assert.match(read(file), new RegExp(`trackProductEvent\\([^)]*${event}`, "su"), `${file}: ${event}`);
  }
});

test("analytics remains first-party and excludes invasive collection", () => {
  const files = [
    "server/analytics/events.ts",
    "server/persistence/analytics.ts",
    "supabase/migrations/20260904120327_product_analytics_foundation.sql",
  ].map(read).join("\n");
  assert.doesNotMatch(files, /meta pixel|tiktok pixel|google analytics|mixpanel|segment|fingerprint|session replay/iu);
  assert.doesNotMatch(read("server/persistence/analytics.ts"), /user-agent|ip_address|request\.ip/iu);
  assert.match(files, /No prompts, responses, chat content, document\/image content, tokens, raw IP addresses, or user-agent strings/u);
});

