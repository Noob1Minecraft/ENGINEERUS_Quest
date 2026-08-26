import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import express, { type RequestHandler } from "express";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GamificationPanel } from "../src/components/GamificationPanel";
import type { GamificationState } from "../src/gamification/gamificationApi";
import { createGamificationRouter } from "../server/routes/gamification";
import type { GamificationRepository } from "../server/persistence/gamification";
import { withServer } from "./helpers";

const USER_ID = "aa000000-0000-4000-8000-000000000001";
const state: GamificationState = {
  progression: { total_xp: 245, level: 3, xp_into_level: 45, xp_needed_for_next_level: 55, progress_percent: 45 },
  streak: { current: 3, longest: 7, last_active_date: "2026-08-26", timezone: "Asia/Almaty" },
  daily_quests: [{ id: "daily_active", name: { en: "Active Day" }, description: { en: "Visit Engineerus" }, xp_reward: 5, cycle_key: "2026-08-26", status: "completed", progress: { current: 1, target: 1 }, completed_at: "2026-08-26T00:00:00Z" }],
  weekly_quests: [{ id: "weekly_ai", name: { en: "Regular Practice" }, description: { en: "Use Tutor" }, xp_reward: 40, cycle_key: "2026-08-24", status: "in_progress", progress: { current: 2, target: 3 }, completed_at: null }],
  achievements: [{ slug: "first-question", category: "learning", name: { en: "First Question" }, description: { en: "Ask once" }, xp_reward: 10, earned_at: "2026-08-26T00:00:00Z" }],
  skills: [{ skill_id: "s", slug: "materials-selection", name: { en: "Materials Selection" }, skill_xp: 15 }],
  quest_chains: [{ slug: "engineering-starter", name: { en: "Engineering Starter" }, description: { en: "Starter chain" }, steps: [{ id: "profile", fact: "profile_complete", name: { en: "Complete profile" } }], xp_reward: 75, completed_steps: 0, completed_at: null, next_step: { id: "profile", fact: "profile_complete", name: { en: "Complete profile" } } }],
};

function appFor(repository: GamificationRepository, authenticated = true) {
  const app = express();
  const authenticate: RequestHandler = (_request, response, next) => {
    if (!authenticated) { response.status(401).json({ error: { code: "auth_required" } }); return; }
    response.locals.auth = { userId: USER_ID, accessToken: "safe-fixture", claims: {} };
    next();
  };
  app.use(createGamificationRouter(authenticate, (_request, _response, next) => next(), repository));
  return app;
}

test("gamification API derives identity from verified authentication", async () => {
  const calls: string[] = [];
  const repository = { refresh: async (userId: string) => { calls.push(userId); return state; } } as GamificationRepository;
  await withServer(appFor(repository), async (base) => {
    const response = await fetch(`${base}/api/gamification`);
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { gamification: GamificationState }).gamification.progression.level, 3);
  });
  assert.deepEqual(calls, [USER_ID]);
});

test("gamification API rejects unauthenticated requests", async () => {
  const repository = { refresh: async () => state } as GamificationRepository;
  await withServer(appFor(repository, false), async (base) => {
    assert.equal((await fetch(`${base}/api/gamification`)).status, 401);
  });
});

test("dashboard panel renders bounded progression, quests, achievement, skill, and next chain step", () => {
  const markup = renderToStaticMarkup(React.createElement(GamificationPanel, { state, language: "en" }));
  assert.match(markup, /Progression/);
  assert.match(markup, /Active Day/);
  assert.match(markup, /Regular Practice/);
  assert.match(markup, /First Question/);
  assert.match(markup, /Materials Selection: 15/);
  assert.match(markup, /Complete profile/);
  assert.match(markup, /55 XP/);
});

test("frontend uses one authenticated refresh endpoint and exposes no reward mutation payload", () => {
  const api = readFileSync(path.resolve("src/gamification/gamificationApi.ts"), "utf8");
  const app = readFileSync(path.resolve("src/App.tsx"), "utf8");
  assert.match(api, /apiFetch<\{ gamification: GamificationState \}>\("\/api\/gamification"\)/);
  assert.doesNotMatch(api, /xp_amount|award_xp|user_id/);
  assert.match(app, /loadGamification\(\)/);
});

test("skill UI is explicitly learning progress rather than certification", () => {
  const migration = readFileSync(path.resolve("supabase/migrations/20260826110605_gamification_v2_progression.sql"), "utf8");
  assert.match(migration, /not professional certification/i);
  assert.match(migration, /skill_xp_reward/);
  assert.doesNotMatch(migration, /certified|licensed engineer/i);
});
