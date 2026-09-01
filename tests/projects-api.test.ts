import assert from "node:assert/strict";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type {
  MyProject,
  ProjectRepository,
  ProjectSummary,
} from "../server/persistence/projects";
import { createProjectsRouter } from "../server/routes/projects";
import { withServer } from "./helpers";

const OWNER_ID = "a1000000-0000-4000-8000-000000000001";
const OTHER_ID = "a1000000-0000-4000-8000-000000000002";
const PROJECT_ID = "b1000000-0000-4000-8000-000000000001";
const NEXT_ID = "b1000000-0000-4000-8000-000000000002";
const DISCIPLINE_ID = "10000000-0000-4000-8000-000000000001";
const NOW = "2026-08-24T00:00:00.000Z";

const summary: ProjectSummary = {
  id: PROJECT_ID,
  title: "Verified project",
  description: "A safe engineering project.",
  primary_discipline: {
    id: DISCIPLINE_ID,
    slug: "mechanical",
    label_ru: "Машиностроение",
    label_kk: "Машина жасау",
    label_en: "Mechanical Engineering",
  },
  status: "open",
  owner: { id: OTHER_ID, username: "engineer", display_name: "Engineer", avatar_url: null },
  created_at: NOW,
  updated_at: NOW,
};

const mine: MyProject = {
  ...summary,
  owner: { id: OWNER_ID, username: "owner", display_name: "Owner", avatar_url: null },
  owner_id: OWNER_ID,
  primary_discipline_id: DISCIPLINE_ID,
  visibility: "private",
};

function repository(overrides: Partial<ProjectRepository> = {}): ProjectRepository {
  return {
    createProject: async () => mine,
    searchProjects: async () => ({ projects: [summary], next_cursor: null }),
    listMyProjects: async () => ({ projects: [mine], next_cursor: null }),
    getProject: async () => ({ project: summary, is_owner: false }),
    updateProject: async () => mine,
    archiveProject: async () => ({ ...mine, status: "archived" }),
    ...overrides,
  };
}

function appFor(repo: ProjectRepository) {
  const app = express();
  app.use(express.json());
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.auth = { userId: OWNER_ID, accessToken: "safe-test-token", claims: {} };
    next();
  };
  const noLimit: RequestHandler = (_request, _response, next) => next();
  app.use(createProjectsRouter(authenticate, noLimit, repo));
  return app;
}

test("project create derives identity from verified auth and uses conservative defaults", async () => {
  let call: unknown;
  const repo = repository({
    createProject: async (userId, token, input) => {
      call = { userId, token, input };
      return mine;
    },
  });
  await withServer(appFor(repo), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "  Verified project  " }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(call, {
      userId: OWNER_ID,
      token: "safe-test-token",
      input: { title: "Verified project" },
    });
    assert.equal((await response.json() as { project: MyProject }).project.owner_id, OWNER_ID);
  });
});

test("project create and update reject ownership fields and invalid values", async () => {
  await withServer(appFor(repository()), async (baseUrl) => {
    for (const body of [
      { title: "Spoof", owner_id: OTHER_ID },
      { title: "Bad", status: "unknown" },
      { title: "Bad", visibility: "everyone" },
    ]) {
      const response = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
    const patch = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_id: OTHER_ID }),
    });
    assert.equal(patch.status, 400);
  });
});

test("project owner and discovery lists are cursor-based, bounded, and omit totals", async () => {
  const calls: unknown[] = [];
  const repo = repository({
    searchProjects: async (userId, token, search) => {
      calls.push({ type: "discover", userId, token, search });
      return { projects: [summary], next_cursor: NEXT_ID };
    },
    listMyProjects: async (userId, token, search) => {
      calls.push({ type: "mine", userId, token, search });
      return { projects: [mine], next_cursor: NEXT_ID };
    },
  });
  await withServer(appFor(repo), async (baseUrl) => {
    const discovery = await fetch(`${baseUrl}/api/projects?query=robot&discipline=${DISCIPLINE_ID}&status=open&cursor=${PROJECT_ID}&limit=25`);
    const discoveryBody = await discovery.json() as Record<string, unknown>;
    assert.equal(discovery.status, 200);
    assert.equal("total" in discoveryBody, false);
    assert.equal(discoveryBody.next_cursor, NEXT_ID);

    const owner = await fetch(`${baseUrl}/api/me/projects?cursor=${PROJECT_ID}&limit=25`);
    assert.equal(owner.status, 200);
    assert.equal("total" in await owner.json(), false);
    assert.equal((await fetch(`${baseUrl}/api/projects?limit=26`)).status, 400);
  });
  assert.deepEqual(calls, [
    {
      type: "discover", userId: OWNER_ID, token: "safe-test-token",
      search: { query: "robot", discipline: DISCIPLINE_ID, status: "open", cursor: PROJECT_ID, limit: 25 },
    },
    { type: "mine", userId: OWNER_ID, token: "safe-test-token", search: { cursor: PROJECT_ID, limit: 25 } },
  ]);
});

test("non-owner detail DTO exposes no owner-only fields or private profile data", async () => {
  await withServer(appFor(repository()), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}`);
    const body = await response.json() as { project: Record<string, unknown>; is_owner: boolean };
    assert.equal(response.status, 200);
    assert.equal(body.is_owner, false);
    assert.equal("owner_id" in body.project, false);
    assert.equal("visibility" in body.project, false);
    assert.equal("email" in body.project, false);
    assert.equal("telegram_user_id" in body.project, false);
    assert.equal("preferred_lang" in body.project, false);
    assert.equal("private_settings" in body.project, false);
    assert.deepEqual(Object.keys(body.project.owner as object).sort(), ["avatar_url", "display_name", "id", "username"]);
  });
});

test("owner detail, update, and DELETE archive paths use verified identity", async () => {
  const calls: unknown[] = [];
  const repo = repository({
    getProject: async () => ({ project: mine, is_owner: true }),
    updateProject: async (userId, token, projectId, input) => {
      calls.push({ type: "update", userId, token, projectId, input });
      return { ...mine, ...input };
    },
    archiveProject: async (userId, token, projectId) => {
      calls.push({ type: "archive", userId, token, projectId });
      return { ...mine, status: "archived" };
    },
  });
  await withServer(appFor(repo), async (baseUrl) => {
    const detail = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}`);
    assert.equal((await detail.json() as { is_owner: boolean }).is_owner, true);
    const updated = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated", status: "open" }),
    });
    assert.equal(updated.status, 200);
    const archived = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}`, { method: "DELETE" });
    assert.equal(archived.status, 200);
    assert.equal((await archived.json() as { archived: boolean }).archived, true);
  });
  assert.deepEqual(calls, [
    {
      type: "update", userId: OWNER_ID, token: "safe-test-token", projectId: PROJECT_ID,
      input: { title: "Updated", status: "open" },
    },
    { type: "archive", userId: OWNER_ID, token: "safe-test-token", projectId: PROJECT_ID },
  ]);
});

test("forbidden or private project operations use a non-enumerating 404", async () => {
  const repo = repository({ getProject: async () => null, updateProject: async () => null, archiveProject: async () => null });
  await withServer(appFor(repo), async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/projects/${PROJECT_ID}`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/projects/${PROJECT_ID}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "No" }),
    })).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/projects/${PROJECT_ID}`, { method: "DELETE" })).status, 404);
  });
});
