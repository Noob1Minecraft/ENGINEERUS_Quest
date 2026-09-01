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
  achievements: [
    { slug: "first-question", category: "learning", name: { en: "First Question" }, description: { en: "Ask once" }, xp_reward: 10, earned_at: "2026-08-26T00:00:00Z" },
    { slug: "first-project", category: "projects", name: { en: "First Project" }, description: { en: "Join once" }, xp_reward: 15, earned_at: null },
  ],
  skills: [{ skill_id: "s", slug: "materials-selection", name: { en: "Materials Selection" }, skill_xp: 15 }],
  quest_chains: [{
    slug: "engineering-starter",
    name: { en: "Engineering Starter" },
    description: { en: "Starter chain" },
    steps: [
      { id: "complete-profile", fact: "profile_complete", name: { en: "Complete profile" } },
      { id: "ask-ai", fact: "ai_questions", name: { en: "Ask first question" } },
      { id: "complete-quest", fact: "learning_quests", name: { en: "Complete first quest" } },
      { id: "explore-engimatch", fact: "engimatch", name: { en: "Explore EngiMatch" } },
      { id: "project-step", fact: "projects", name: { en: "Create or join a project" } },
    ],
    xp_reward: 75,
    completed_steps: 1,
    completed_at: null,
    next_step: { id: "ask-ai", fact: "ai_questions", name: { en: "Ask first question" } },
  }],
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

test("dashboard panel renders authoritative progression, calm streak, weekly goal, achievements, skills, and one next action", () => {
  const markup = renderToStaticMarkup(React.createElement(GamificationPanel, { state, language: "en", onNavigate: () => undefined }));
  assert.match(markup, /Engineering progress/);
  assert.match(markup, /Today&#x27;s activity is complete/);
  assert.match(markup, /Regular Practice/);
  assert.match(markup, /First Question/);
  assert.match(markup, /First Project/);
  assert.match(markup, /Not unlocked yet/);
  assert.match(markup, /Materials Selection/);
  assert.match(markup, /15 skill XP/);
  assert.match(markup, /Complete profile/);
  assert.match(markup, /Ask first question/);
  assert.match(markup, /Current step/);
  assert.match(markup, />Open</);
  assert.match(markup, /55 XP/);
  assert.match(markup, /role="progressbar"/);
  assert.match(markup, /This is learning progress, not professional certification/);
});

test("dashboard exposes honest empty states without inventing progression data", () => {
  const empty: GamificationState = {
    ...state,
    daily_quests: [],
    weekly_quests: [],
    achievements: [],
    skills: [],
    quest_chains: [],
  };
  const markup = renderToStaticMarkup(React.createElement(GamificationPanel, { state: empty, language: "en" }));
  assert.match(markup, /No weekly goals yet/);
  assert.match(markup, /No achievements yet/);
  assert.match(markup, /No skill progress yet/);
  assert.doesNotMatch(markup, /certified engineer/i);
});

test("dashboard uses the same authoritative state in Russian and Kazakh", () => {
  const localizedState: GamificationState = {
    ...state,
    quest_chains: [{
      ...state.quest_chains[0],
      name: { ru: "Инженерный старт", kk: "Инженерлік бастау" },
      steps: state.quest_chains[0].steps.map((step, index) => ({
        ...step,
        name: { ru: `Шаг ${index + 1}`, kk: `Қадам ${index + 1}` },
      })),
      next_step: { ...state.quest_chains[0].next_step!, name: { ru: "Задай первый вопрос", kk: "Алғашқы сұрақты қой" } },
    }],
  };
  const russian = renderToStaticMarkup(React.createElement(GamificationPanel, { state: localizedState, language: "ru" }));
  const kazakh = renderToStaticMarkup(React.createElement(GamificationPanel, { state: localizedState, language: "kk" }));
  assert.match(russian, /Инженерный прогресс/);
  assert.match(russian, /Задай первый вопрос/);
  assert.match(kazakh, /Инженерлік прогресс/);
  assert.match(kazakh, /Алғашқы сұрақты қой/);
});

test("frontend uses one authenticated refresh endpoint and exposes no reward mutation payload", () => {
  const api = readFileSync(path.resolve("src/gamification/gamificationApi.ts"), "utf8");
  const app = readFileSync(path.resolve("src/App.tsx"), "utf8");
  assert.match(api, /apiFetch<\{ gamification: GamificationState \}>\("\/api\/gamification"\)/);
  assert.doesNotMatch(api, /xp_amount|award_xp|user_id/);
  assert.match(app, /loadGamification\(\)/);
  assert.match(app, /activeTab !== 'profile' && activeTab !== 'home'/);
  assert.match(app, /gamificationStatus === 'loading'/);
  assert.match(app, /gamificationStatus === 'error'/);
});

test("skill UI is explicitly learning progress rather than certification", () => {
  const migration = readFileSync(path.resolve("supabase/migrations/20260826110605_gamification_v2_progression.sql"), "utf8");
  assert.match(migration, /not professional certification/i);
  assert.match(migration, /skill_xp_reward/);
  assert.doesNotMatch(migration, /certified|licensed engineer/i);
});
