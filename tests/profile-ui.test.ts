import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { performProfileSignOut, PublicProfileCard, ProfileTab } from '../src/components/ProfileTab';
import {
  loadProfileWorkspace,
  saveOwnerProfile,
  saveOwnerSettings,
  searchProfiles,
  type ProfileFetcher,
} from '../src/profile/profileApi';
import type { CanonicalUser, ProfileTaxonomies, PublicProfile } from '../src/types';

const DISCIPLINE_ID = '10000000-0000-4000-8000-000000000001';
const SKILL_ID = '20000000-0000-4000-8000-000000000001';

const publicProfile: PublicProfile = {
  id: '70000000-0000-4000-8000-000000000001',
  username: 'engineer',
  display_name: 'Engineer One',
  avatar_url: 'https://images.example.test/avatar.png',
  university_name: 'Engineering University',
  primary_discipline: {
    id: DISCIPLINE_ID,
    slug: 'mechanical',
    label_ru: 'Машиностроение',
    label_kk: 'Машина жасау',
    label_en: 'Mechanical engineering',
  },
  bio: 'Builds machines.',
  portfolio_url: 'https://example.com/portfolio',
  available_for_projects: true,
  skills: [{
    id: SKILL_ID,
    slug: 'cad',
    label_ru: 'САПР',
    label_kk: 'АЖЖ',
    label_en: 'CAD',
    proficiency: 4,
  }],
  tools: [],
  interests: [],
  languages: [{ language_code: 'ru', proficiency: 5 }],
};

const account: CanonicalUser = {
  profile: {
    ...publicProfile,
    primary_discipline_id: DISCIPLINE_ID,
    profile_visibility: 'authenticated',
    portfolio_visibility: 'authenticated',
    created_at: '2026-08-23T00:00:00.000Z',
    updated_at: '2026-08-23T00:00:00.000Z',
  },
  private_settings: {
    preferred_lang: 'ru',
    allow_project_invitations: true,
    allow_direct_messages: false,
    created_at: '2026-08-23T00:00:00.000Z',
    updated_at: '2026-08-23T00:00:00.000Z',
  },
  progress: {
    total_xp: 125,
    level: 2,
    streak_days: 3,
    longest_streak: 7,
    requests_count: 2,
    material_count: 1,
    patent_count: 0,
    modules_used: ['tutor'],
  },
  completed_quests: ['first_contact'],
};

const taxonomies: ProfileTaxonomies = {
  disciplines: [publicProfile.primary_discipline!],
  skills: [publicProfile.skills[0]],
  tools: [],
  interests: [],
};

test('Profile workspace hydration loads authoritative owner data and taxonomies', async () => {
  const calls: string[] = [];
  const fetcher: ProfileFetcher = async <T>(endpoint: string) => {
    calls.push(endpoint);
    return (endpoint === '/api/me' ? account : taxonomies) as T;
  };
  assert.deepEqual(await loadProfileWorkspace(fetcher), { account, taxonomies });
  assert.deepEqual(calls.sort(), ['/api/me', '/api/profile-taxonomies'].sort());
});

test('Profile and private-settings saves PATCH only owner endpoints then refetch authoritative state', async () => {
  const calls: Array<{ endpoint: string; method?: string; body?: string }> = [];
  const fetcher: ProfileFetcher = async <T>(endpoint: string, options?: RequestInit) => {
    calls.push({ endpoint, method: options?.method, body: options?.body as string | undefined });
    return account as T;
  };

  assert.equal((await saveOwnerProfile({ display_name: 'Updated' }, fetcher)).profile.display_name, 'Engineer One');
  assert.equal((await saveOwnerSettings({ allow_direct_messages: true }, fetcher)).private_settings.allow_direct_messages, false);
  assert.deepEqual(calls.map(({ endpoint, method }) => ({ endpoint, method })), [
    { endpoint: '/api/me/profile', method: 'PATCH' },
    { endpoint: '/api/me', method: undefined },
    { endpoint: '/api/me/profile-settings', method: 'PATCH' },
    { endpoint: '/api/me', method: undefined },
  ]);
  assert.deepEqual(JSON.parse(calls[0].body!), { display_name: 'Updated' });
});

test('Profile search uses filters, bounded cursor pagination, and no total-account request', async () => {
  let requested = '';
  const fetcher: ProfileFetcher = async <T>(endpoint: string) => {
    requested = endpoint;
    return { profiles: [publicProfile], next_cursor: publicProfile.id } as T;
  };
  const result = await searchProfiles({
    query: 'Engineer', discipline: DISCIPLINE_ID, skill: SKILL_ID,
    available: true, cursor: publicProfile.id, limit: 200,
  }, fetcher);
  const url = new URL(requested, 'https://example.test');
  assert.equal(url.pathname, '/api/profiles');
  assert.equal(url.searchParams.get('query'), 'Engineer');
  assert.equal(url.searchParams.get('discipline'), DISCIPLINE_ID);
  assert.equal(url.searchParams.get('skill'), SKILL_ID);
  assert.equal(url.searchParams.get('available'), 'true');
  assert.equal(url.searchParams.get('cursor'), publicProfile.id);
  assert.equal(url.searchParams.get('limit'), '25');
  assert.equal('total' in result, false);
});

test('Owner Profile v2 UI renders progress and private settings without private identity leakage', () => {
  const markup = renderToStaticMarkup(React.createElement(ProfileTab, {
    account,
    authenticated: true,
    loading: false,
    lang: 'ru',
    onRequireAuth: () => undefined,
    onAccountChange: () => undefined,
    onSignOut: async () => undefined,
  }));
  assert.match(markup, /Engineer One/);
  assert.match(markup, /src="https:\/\/images\.example\.test\/avatar\.png"/);
  assert.match(markup, /125 XP/);
  assert.match(markup, />3 \/ 7</);
  assert.match(markup, /Приватные настройки/);
  assert.match(markup, /Прогресс автоматически сохраняется/);
  assert.match(markup, /Выйти из аккаунта/);
  assert.doesNotMatch(markup, /telegram|oauth|auth metadata|email/i);
});

test('Public profile view contains only PublicProfile fields', () => {
  const markup = renderToStaticMarkup(React.createElement(PublicProfileCard, { profile: publicProfile, lang: 'en' }));
  assert.match(markup, /Engineer One/);
  assert.match(markup, /Mechanical engineering/);
  assert.match(markup, /CAD/);
  assert.doesNotMatch(markup, /private_settings|profile_visibility|telegram|email|oauth/i);
  assert.doesNotMatch(markup, /Выйти из аккаунта|Sign out|Аккаунттан шығу/);
});

test('Profile logout invokes signOut once and reports a failure without throwing', async () => {
  let calls = 0;
  let errors = 0;
  assert.equal(await performProfileSignOut(async () => { calls += 1; }, () => { errors += 1; }), true);
  assert.equal(calls, 1);
  assert.equal(errors, 0);

  assert.equal(await performProfileSignOut(async () => {
    calls += 1;
    throw new Error('sign out failed');
  }, () => { errors += 1; }), false);
  assert.equal(calls, 2);
  assert.equal(errors, 1);
});

test('Profile UI source wires validation, privacy failure, taxonomy relations, and cursor states without Telegram', () => {
  const source = readFileSync(path.resolve('src/components/ProfileTab.tsx'), 'utf8');
  assert.match(source, /saveOwnerProfile/);
  assert.match(source, /saveOwnerSettings/);
  assert.match(source, /profile-taxonomies/);
  assert.match(source, /nextCursor/);
  assert.match(source, /status === 404/);
  assert.match(source, /skills: form\.skills/);
  assert.match(source, /disabled=\{signingOut\}/);
  assert.match(source, /signingOut \? copy\.signingOut : copy\.signOut/);
  assert.match(source, /setError\(copy\.signOutError\)/);
  assert.doesNotMatch(source, /Telegram|telegram_user_id/);
});
