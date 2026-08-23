import assert from "node:assert/strict";
import test from "node:test";
import express, { type RequestHandler } from "express";
import { PersistenceError } from "../server/persistence/errors";
import type { ProfileRepository, PublicProfile } from "../server/persistence/profiles";
import { createProfilesRouter } from "../server/routes/profiles";
import { withServer } from "./helpers";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const SKILL_ID = "20000000-0000-4000-8000-000000000001";
const NOW = "2026-08-23T00:00:00.000Z";

const publicProfile: PublicProfile = {
  id: OTHER_ID,
  username: "engineer_b",
  display_name: "Engineer B",
  avatar_url: null,
  university_name: "Engineering University",
  primary_discipline: null,
  bio: "Mechanical engineer",
  portfolio_url: null,
  available_for_projects: true,
  skills: [],
  tools: [],
  interests: [],
  languages: [{ language_code: "ru", proficiency: 5 }],
};

function repository(overrides: Partial<ProfileRepository> = {}): ProfileRepository {
  return {
    loadCanonicalUser: async () => { throw new Error("unused"); },
    updateProfile: async () => ({
      ...publicProfile,
      id: OWNER_ID,
      primary_discipline_id: null,
      profile_visibility: "private",
      portfolio_visibility: "private",
      created_at: NOW,
      updated_at: NOW,
    }),
    updateSettings: async () => ({
      preferred_lang: "ru",
      allow_project_invitations: true,
      allow_direct_messages: true,
      created_at: NOW,
      updated_at: NOW,
    }),
    getPublicProfile: async () => publicProfile,
    searchProfiles: async () => ({ profiles: [publicProfile], next_cursor: null }),
    taxonomies: async () => ({ disciplines: [], skills: [], tools: [], interests: [] }),
    ...overrides,
  };
}

function appFor(repo: ProfileRepository) {
  const app = express();
  app.use(express.json());
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.auth = { userId: OWNER_ID, accessToken: "safe-test-token", claims: {} };
    next();
  };
  const noLimit: RequestHandler = (_request, _response, next) => next();
  app.use(createProfilesRouter(authenticate, noLimit, repo));
  return app;
}

test("PublicProfile endpoint exposes only safe profile fields", async () => {
  await withServer(appFor(repository()), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/profiles/${OTHER_ID}`);
    assert.equal(response.status, 200);
    const body = await response.json() as { profile: Record<string, unknown> };
    assert.equal(body.profile.id, OTHER_ID);
    assert.equal(body.profile.available_for_projects, true);
    assert.equal("email" in body.profile, false);
    assert.equal("telegram_user_id" in body.profile, false);
    assert.equal("private_settings" in body.profile, false);
    assert.equal("profile_visibility" in body.profile, false);
  });
});

test("private profiles return 404 through the public endpoint", async () => {
  await withServer(appFor(repository({ getPublicProfile: async () => null })), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/profiles/${OTHER_ID}`);
    assert.equal(response.status, 404);
  });
});

test("profile search is bounded, cursor-based, filterable, and omits totals", async () => {
  let received: Parameters<ProfileRepository["searchProfiles"]>[1] | undefined;
  const repo = repository({
    searchProfiles: async (_requesterId, search) => {
      received = search;
      return { profiles: [publicProfile], next_cursor: OTHER_ID };
    },
  });
  await withServer(appFor(repo), async (baseUrl) => {
    const url = `${baseUrl}/api/profiles?available=true&skill=${SKILL_ID}&cursor=${OWNER_ID}&limit=25`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(received, {
      available: true,
      skill: SKILL_ID,
      cursor: OWNER_ID,
      limit: 25,
    });
    assert.equal("total" in body, false);
    assert.equal(body.next_cursor, OTHER_ID);
  });

  await withServer(appFor(repo), async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/profiles?limit=26`)).status, 400);
  });
});

test("owner profile and private-settings patches use only the verified JWT owner", async () => {
  const calls: Array<{ operation: string; userId: string; token: string; update: unknown }> = [];
  const repo = repository({
    updateProfile: async (userId, token, update) => {
      calls.push({ operation: "profile", userId, token, update });
      return repository().updateProfile(userId, token, update);
    },
    updateSettings: async (userId, token, update) => {
      calls.push({ operation: "settings", userId, token, update });
      return repository().updateSettings(userId, token, update);
    },
  });
  await withServer(appFor(repo), async (baseUrl) => {
    const profileResponse = await fetch(`${baseUrl}/api/me/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: OTHER_ID, display_name: "Owner" }),
    });
    assert.equal(profileResponse.status, 400, "unknown identity fields must be rejected");

    assert.equal((await fetch(`${baseUrl}/api/me/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Owner", skills: [{ id: SKILL_ID, proficiency: 4 }] }),
    })).status, 200);

    assert.equal((await fetch(`${baseUrl}/api/me/profile-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferred_lang: "kk", allow_direct_messages: false }),
    })).status, 200);
  });
  assert.deepEqual(calls.map(({ operation, userId, token }) => ({ operation, userId, token })), [
    { operation: "profile", userId: OWNER_ID, token: "safe-test-token" },
    { operation: "settings", userId: OWNER_ID, token: "safe-test-token" },
  ]);
});

test("invalid taxonomy identifiers are returned as validation errors", async () => {
  const repo = repository({
    updateProfile: async () => {
      throw new PersistenceError(400, "invalid_taxonomy_id", "A selected profile taxonomy value is invalid.");
    },
  });
  await withServer(appFor(repo), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/me/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills: [{ id: SKILL_ID }] }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { code: "invalid_taxonomy_id", message: "A selected profile taxonomy value is invalid." },
    });
  });
});
