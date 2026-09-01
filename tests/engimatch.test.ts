import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import { scoreEngiMatch, stableMatchSort } from '../server/matching/engimatchScoring';
import { isEligibleProjectRole, isEligibleTeammateProfile } from '../server/matching/engimatchEligibility';
import type { EngiMatchRepository } from '../server/persistence/engimatch';
import { createEngiMatchRouter } from '../server/routes/engimatch';
import { findProjectMatches, findTeammates } from '../src/engimatch/engimatchApi';
import type { ProjectFetcher } from '../src/projects/projectApi';
import { withServer } from './helpers';

const USER_ID = 'a1000000-0000-4000-8000-000000000001';
const ROLE_ID = 'c1000000-0000-4000-8000-000000000001';
const skill = (id: string, label: string) => ({ id, label });

test('engi-match-v1 applies the documented 45/25/10/8/5/7 deterministic score', () => {
  const result = scoreEngiMatch({
    profileSkills: [skill('a', 'CAD'), skill('b', 'FEA')], requiredSkills: [skill('a', 'CAD'), skill('c', 'GD&T')], optionalSkills: [skill('b', 'FEA')],
    profileDisciplineId: 'mechanical', roleDisciplineId: 'mechanical', profileTools: [skill('t', 'SolidWorks')], teamTools: [skill('t', 'SolidWorks')],
    profileInterests: [skill('i', 'Robotics')], teamInterests: [skill('i', 'Robotics')], profileLanguages: ['ru', 'en'], teamLanguages: ['ru'],
  });
  assert.equal(result.score, 77.5);
  assert.deepEqual(result.matched_required_skills, ['CAD']);
  assert.deepEqual(result.missing_required_skills, ['GD&T']);
  assert.equal(result.scoring_version, 'engi-match-v1');
});

test('stable ordering is score descending then database identity', () => {
  assert.deepEqual(stableMatchSort([{ score: 50, stable_id: 'b' }, { score: 70, stable_id: 'z' }, { score: 50, stable_id: 'a' }]).map(({ stable_id }) => stable_id), ['z', 'a', 'b']);
});

test('teammate eligibility excludes private, unavailable, owner/member, and invitation-disabled rows', () => {
  const excluded = new Set(['owner', 'member', 'invited']);
  const allowed = new Set(['real', 'owner', 'member', 'invited', 'private', 'unavailable']);
  assert.equal(isEligibleTeammateProfile({ id: 'real', profile_visibility: 'authenticated', available_for_projects: true }, excluded, allowed), true);
  assert.equal(isEligibleTeammateProfile({ id: 'private', profile_visibility: 'private', available_for_projects: true }, excluded, allowed), false);
  assert.equal(isEligibleTeammateProfile({ id: 'unavailable', profile_visibility: 'public', available_for_projects: false }, excluded, allowed), false);
  for (const id of excluded) assert.equal(isEligibleTeammateProfile({ id, profile_visibility: 'public', available_for_projects: true }, excluded, allowed), false);
  assert.equal(isEligibleTeammateProfile({ id: 'disabled', profile_visibility: 'public', available_for_projects: true }, excluded, allowed), false);
});

test('project eligibility excludes own/member/pending, closed, archived, and filled roles', () => {
  const base = { requesterId: 'user', ownerId: 'owner', projectStatus: 'open', projectVisibility: 'authenticated', roleStatus: 'open', positionsTotal: 2, positionsFilled: 1, requesterIsMember: false, hasPendingApplication: false };
  assert.equal(isEligibleProjectRole(base), true);
  assert.equal(isEligibleProjectRole({ ...base, ownerId: 'user' }), false);
  assert.equal(isEligibleProjectRole({ ...base, requesterIsMember: true }), false);
  assert.equal(isEligibleProjectRole({ ...base, hasPendingApplication: true }), false);
  assert.equal(isEligibleProjectRole({ ...base, roleStatus: 'filled' }), false);
  assert.equal(isEligibleProjectRole({ ...base, projectStatus: 'archived' }), false);
  assert.equal(isEligibleProjectRole({ ...base, positionsFilled: 2 }), false);
});

function repository(): EngiMatchRepository {
  return {
    findTeammates: async (userId, token, roleId, query) => ({ matches: [{ id: 'real-profile' }], scoring_version: 'engi-match-v1', candidate_pool_limited_to: 100, proof: { userId, token, roleId, query } }),
    findProjects: async (userId, token, query) => ({ matches: [{ id: 'real-role' }], scoring_version: 'engi-match-v1', candidate_pool_limited_to: 100, proof: { userId, token, query } }),
  } as unknown as EngiMatchRepository;
}

function appFor(repo: EngiMatchRepository) {
  const app = express();
  const auth: RequestHandler = (_request, response, next) => { response.locals.auth = { userId: USER_ID, accessToken: 'verified-token', claims: {} }; next(); };
  app.use(createEngiMatchRouter(auth, (_request, _response, next) => next(), repo));
  return app;
}

test('matching endpoints use verified identity, validate bounds, and never accept target user IDs', async () => {
  await withServer(appFor(repository()), async (baseUrl) => {
    const teammate = await fetch(`${baseUrl}/api/project-roles/${ROLE_ID}/matches?limit=25&min_score=40`);
    assert.equal(teammate.status, 200);
    const payload = await teammate.json() as { proof: Record<string, unknown> };
    assert.deepEqual(payload.proof, { userId: USER_ID, token: 'verified-token', roleId: ROLE_ID, query: { limit: 25, minScore: 40 } });
    assert.equal((await fetch(`${baseUrl}/api/engimatch/projects?target_user_id=${USER_ID}`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/engimatch/projects?limit=26`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/project-roles/not-a-uuid/matches`)).status, 400);
  });
});

test('frontend API calls only the real matching endpoints with bounded query values', async () => {
  const calls: string[] = [];
  const fetcher: ProjectFetcher = async <T>(endpoint: string) => { calls.push(endpoint); return { matches: [], scoring_version: 'engi-match-v1', candidate_pool_limited_to: 100 } as T; };
  await findTeammates(ROLE_ID, 100, -5, fetcher);
  await findProjectMatches(12, 25, fetcher);
  assert.deepEqual(calls, [`/api/project-roles/${ROLE_ID}/matches?limit=25&min_score=0`, '/api/engimatch/projects?limit=12&min_score=25']);
});

test('EngiMatch UI reuses Phase C invite/apply and contains no fictional or private candidate source', () => {
  const source = readFileSync(path.resolve('src/components/EngiMatchTab.tsx'), 'utf8');
  assert.match(source, /inviteToProjectRole/);
  assert.match(source, /applyToProjectRole/);
  assert.match(source, /Find teammate|Найти участника/);
  assert.match(source, /Find project|Найти проект/);
  assert.doesNotMatch(source, /LeaderboardEntry|LEADERBOARD|telegram_user_id|preferred_lang|allow_direct_messages|email|oauth/i);
});

test('repository source enforces real-row gates and safe pool limits', () => {
  const source = readFileSync(path.resolve('server/persistence/engimatch.ts'), 'utf8');
  for (const required of ['profile_visibility', 'available_for_projects', 'allow_project_invitations', 'project_members', 'project_invitations', 'project_applications', 'positions_total', 'MAX_POOL']) assert.match(source, new RegExp(required));
  for (const forbidden of ['telegram_user_id', 'preferred_lang', 'allow_direct_messages', 'auth.users', 'LeaderboardEntry']) assert.doesNotMatch(source, new RegExp(forbidden, 'i'));
});
