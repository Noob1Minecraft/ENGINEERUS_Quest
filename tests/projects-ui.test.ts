import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectCard, ProjectsTab } from '../src/components/ProjectsTab';
import {
  archiveProject,
  createProject,
  discoverProjects,
  listMyProjects,
  loadProject,
  updateProject,
  type ProjectFetcher,
} from '../src/projects/projectApi';
import type { MyProject, ProjectSummary } from '../src/types';

const PROJECT_ID = 'b1000000-0000-4000-8000-000000000001';
const DISCIPLINE_ID = '10000000-0000-4000-8000-000000000001';

const project: ProjectSummary = {
  id: PROJECT_ID,
  title: 'Solar test bench',
  description: 'Design a safe instrumentation test bench.',
  primary_discipline: {
    id: DISCIPLINE_ID,
    slug: 'electrical',
    label_ru: 'Электротехника',
    label_kk: 'Электротехника',
    label_en: 'Electrical Engineering',
  },
  status: 'open',
  owner: { id: 'a1000000-0000-4000-8000-000000000002', username: 'engineer', display_name: 'Engineer', avatar_url: null },
  created_at: '2026-08-24T00:00:00.000Z',
  updated_at: '2026-08-24T00:00:00.000Z',
};

const mine: MyProject = {
  ...project,
  owner_id: 'a1000000-0000-4000-8000-000000000001',
  primary_discipline_id: DISCIPLINE_ID,
  visibility: 'private',
};

test('project API hydration uses owner and discovery cursor endpoints without totals', async () => {
  const calls: string[] = [];
  const fetcher: ProjectFetcher = async <T>(endpoint: string) => {
    calls.push(endpoint);
    return { projects: endpoint.startsWith('/api/me/') ? [mine] : [project], next_cursor: PROJECT_ID } as T;
  };
  const [owner, discovery] = await Promise.all([
    listMyProjects({ cursor: PROJECT_ID, limit: 100 }, fetcher),
    discoverProjects({ query: 'solar', discipline: DISCIPLINE_ID, status: 'open', limit: 100 }, fetcher),
  ]);
  assert.equal(owner.projects[0].visibility, 'private');
  assert.equal('total' in discovery, false);
  const ownerUrl = new URL(calls[0], 'https://example.test');
  const discoveryUrl = new URL(calls[1], 'https://example.test');
  assert.equal(ownerUrl.pathname, '/api/me/projects');
  assert.equal(ownerUrl.searchParams.get('limit'), '25');
  assert.equal(discoveryUrl.searchParams.get('query'), 'solar');
  assert.equal(discoveryUrl.searchParams.get('discipline'), DISCIPLINE_ID);
  assert.equal(discoveryUrl.searchParams.get('status'), 'open');
});

test('create, detail, edit, authoritative refetch, and archive helpers use focused endpoints', async () => {
  const calls: Array<{ endpoint: string; method?: string; body?: string }> = [];
  const fetcher: ProjectFetcher = async <T>(endpoint: string, options?: RequestInit) => {
    calls.push({ endpoint, method: options?.method, body: options?.body as string | undefined });
    if (options?.method === 'DELETE') return { project: { ...mine, status: 'archived' }, archived: true } as T;
    if (endpoint === `/api/projects/${PROJECT_ID}` && !options) return { project: mine, is_owner: true } as T;
    return { project: mine } as T;
  };

  assert.equal((await createProject({ title: 'Solar test bench' }, fetcher)).id, PROJECT_ID);
  assert.equal((await loadProject(PROJECT_ID, fetcher)).is_owner, true);
  assert.equal((await updateProject(PROJECT_ID, { title: 'Updated' }, fetcher)).title, project.title);
  assert.equal((await archiveProject(PROJECT_ID, fetcher)).status, 'archived');
  assert.deepEqual(calls.map(({ endpoint, method }) => ({ endpoint, method })), [
    { endpoint: '/api/projects', method: 'POST' },
    { endpoint: `/api/projects/${PROJECT_ID}`, method: undefined },
    { endpoint: `/api/projects/${PROJECT_ID}`, method: 'PATCH' },
    { endpoint: `/api/projects/${PROJECT_ID}`, method: 'DELETE' },
  ]);
});

test('public project card renders only safe owner/project fields', () => {
  const markup = renderToStaticMarkup(React.createElement(ProjectCard, { project, lang: 'en' }));
  assert.match(markup, /Solar test bench/);
  assert.match(markup, /Electrical Engineering/);
  assert.match(markup, /Engineer/);
  assert.doesNotMatch(markup, /owner_id|visibility|email|telegram_user_id|preferred_lang|oauth|private_settings/i);
});

test('owner card and unauthenticated Projects page have safe distinct states', () => {
  const ownerMarkup = renderToStaticMarkup(React.createElement(ProjectCard, { project: mine, lang: 'ru', ownerView: true }));
  assert.match(ownerMarkup, /Мои проекты/);
  assert.doesNotMatch(ownerMarkup, /private_settings|telegram|email/i);

  const guestMarkup = renderToStaticMarkup(React.createElement(ProjectsTab, {
    authenticated: false,
    lang: 'en',
    onRequireAuth: () => undefined,
  }));
  assert.match(guestMarkup, /Sign in to work with projects/);
  assert.match(guestMarkup, /Engineering projects/);
});

test('Projects UI source includes loading, empty, validation, owner edit, discovery, and future-role states', () => {
  const source = readFileSync(path.resolve('src/components/ProjectsTab.tsx'), 'utf8');
  assert.match(source, /listMyProjects/);
  assert.match(source, /discoverProjects/);
  assert.match(source, /createProject/);
  assert.match(source, /updateProject/);
  assert.match(source, /archiveProject/);
  assert.match(source, /LoaderCircle/);
  assert.match(source, /emptyMine/);
  assert.match(source, /emptyDiscover/);
  assert.match(source, /future/);
  assert.doesNotMatch(source, /application|invitation|direct chat|EngiMatch|Realtime/i);
});
