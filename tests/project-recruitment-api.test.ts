import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import type {
  ProjectApplication,
  ProjectInvitation,
  ProjectRecruitmentRepository,
  ProjectRole,
} from '../server/persistence/projectRecruitment';
import { recruitmentFailure } from '../server/persistence/projectRecruitment';
import { createProjectRecruitmentRouter } from '../server/routes/projectRecruitment';
import { withServer } from './helpers';

const USER_ID = 'a1000000-0000-4000-8000-000000000001';
const PROJECT_ID = 'b1000000-0000-4000-8000-000000000001';
const ROLE_ID = 'c1000000-0000-4000-8000-000000000001';
const APPLICATION_ID = 'd1000000-0000-4000-8000-000000000001';
const INVITATION_ID = 'e1000000-0000-4000-8000-000000000001';
const PROFILE_ID = 'a1000000-0000-4000-8000-000000000002';
const SKILL_ID = '20000000-0000-4000-8000-000000000001';
const NOW = '2026-08-24T00:00:00.000Z';

const role: ProjectRole = {
  id: ROLE_ID, project_id: PROJECT_ID, title: 'Mechanical designer', description: 'Design parts.',
  discipline_id: null, discipline: null, positions_total: 1, positions_filled: 0,
  positions_available: 1, status: 'open', skills: [], created_at: NOW, updated_at: NOW,
};
const application: ProjectApplication = {
  id: APPLICATION_ID, project_id: PROJECT_ID, role_id: ROLE_ID, applicant_id: PROFILE_ID,
  applicant: { id: PROFILE_ID, username: 'candidate', display_name: 'Candidate', avatar_url: null },
  role: null, note: 'Ready to help.', status: 'pending', created_at: NOW, updated_at: NOW, decided_at: null,
};
const invitation: ProjectInvitation = {
  id: INVITATION_ID, project_id: PROJECT_ID, role_id: ROLE_ID, invitee_id: PROFILE_ID,
  inviter_id: USER_ID, invitee: null, inviter: null, role: null, note: '', status: 'pending',
  expires_at: '2026-09-07T00:00:00.000Z', created_at: NOW, updated_at: NOW, decided_at: null,
};

function repository(overrides: Partial<ProjectRecruitmentRepository> = {}): ProjectRecruitmentRepository {
  return {
    listRoles: async () => [role], createRole: async () => role, updateRole: async () => role,
    closeRole: async () => ({ ...role, status: 'closed' }),
    createApplication: async () => application, listMyApplications: async () => [application],
    listProjectApplications: async () => [application], acceptApplication: async () => ({ ...application, status: 'accepted' }),
    rejectApplication: async () => ({ ...application, status: 'rejected' }),
    withdrawApplication: async () => ({ ...application, status: 'withdrawn' }),
    createInvitation: async () => invitation, listMyInvitations: async () => [invitation],
    listProjectInvitations: async () => [invitation], acceptInvitation: async () => ({ ...invitation, status: 'accepted' }),
    rejectInvitation: async () => ({ ...invitation, status: 'rejected' }),
    cancelInvitation: async () => ({ ...invitation, status: 'cancelled' }),
    ...overrides,
  };
}

function appFor(repo: ProjectRecruitmentRepository) {
  const app = express();
  app.use(express.json());
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.auth = { userId: USER_ID, accessToken: 'safe-test-token', claims: {} };
    next();
  };
  app.use(createProjectRecruitmentRouter(authenticate, (_request, _response, next) => next(), repo));
  return app;
}

test('owner role create uses the authenticated token and normalized skill requirements', async () => {
  let call: unknown;
  const repo = repository({
    createRole: async (token, projectId, input) => { call = { token, projectId, input }; return role; },
  });
  await withServer(appFor(repo), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/roles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: ' Mechanical designer ', positions_total: 2,
        skills: [{ skill_id: SKILL_ID, requirement: 'required', weight: 10 }],
      }),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json() as { role: ProjectRole }).role.id, ROLE_ID);
  });
  assert.deepEqual(call, {
    token: 'safe-test-token', projectId: PROJECT_ID,
    input: { title: 'Mechanical designer', positions_total: 2, skills: [{ skill_id: SKILL_ID, requirement: 'required', weight: 10 }] },
  });
});

test('role payload rejects duplicates, filled status, and ownership fields', async () => {
  await withServer(appFor(repository()), async (baseUrl) => {
    for (const body of [
      { title: 'Role', owner_id: PROFILE_ID },
      { title: 'Role', skills: [{ skill_id: SKILL_ID, requirement: 'required', weight: 1 }, { skill_id: SKILL_ID, requirement: 'optional', weight: 2 }] },
    ]) {
      assert.equal((await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/roles`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })).status, 400);
    }
    assert.equal((await fetch(`${baseUrl}/api/project-roles/${ROLE_ID}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'filled' }),
    })).status, 400);
  });
});

test('application action endpoints expose only explicit lifecycle transitions', async () => {
  const calls: string[] = [];
  const repo = repository({
    createApplication: async () => { calls.push('create'); return application; },
    acceptApplication: async () => { calls.push('accept'); return { ...application, status: 'accepted' }; },
    rejectApplication: async () => { calls.push('reject'); return { ...application, status: 'rejected' }; },
    withdrawApplication: async () => { calls.push('withdraw'); return { ...application, status: 'withdrawn' }; },
  });
  await withServer(appFor(repo), async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/project-roles/${ROLE_ID}/applications`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'Ready.' }),
    })).status, 201);
    for (const action of ['accept', 'reject', 'withdraw']) {
      assert.equal((await fetch(`${baseUrl}/api/project-applications/${APPLICATION_ID}/${action}`, { method: 'POST' })).status, 200);
    }
  });
  assert.deepEqual(calls, ['create', 'accept', 'reject', 'withdraw']);
});

test('private-role oracle outcomes map identically to nonexistent roles over HTTP', async () => {
  const inaccessibleCases = [
    'nonexistent',
    'private-open',
    'private-closed',
    'private-filled',
    'private-draft-project',
    'private-archived-project',
  ];

  for (const scenario of inaccessibleCases) {
    const repo = repository({
      createApplication: async () => recruitmentFailure({ code: 'P0001', message: 'project_role_not_found' }),
    });
    await withServer(appFor(repo), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/project-roles/${ROLE_ID}/applications`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: scenario }),
      });
      assert.equal(response.status, 404, scenario);
      assert.deepEqual(await response.json(), {
        error: { code: 'project_role_not_found', message: 'The requested project resource was not found.' },
      }, scenario);
    });
  }
});

test('invitation endpoints use verified auth context and explicit accept/reject/cancel actions', async () => {
  const calls: unknown[] = [];
  const repo = repository({
    createInvitation: async (token, roleId, inviteeId, note) => {
      calls.push({ action: 'create', token, roleId, inviteeId, note }); return invitation;
    },
    acceptInvitation: async () => { calls.push({ action: 'accept' }); return { ...invitation, status: 'accepted' }; },
    rejectInvitation: async () => { calls.push({ action: 'reject' }); return { ...invitation, status: 'rejected' }; },
    cancelInvitation: async () => { calls.push({ action: 'cancel' }); return { ...invitation, status: 'cancelled' }; },
  });
  await withServer(appFor(repo), async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/project-roles/${ROLE_ID}/invitations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitee_id: PROFILE_ID, note: 'Join us.' }),
    })).status, 201);
    for (const action of ['accept', 'reject', 'cancel']) {
      assert.equal((await fetch(`${baseUrl}/api/project-invitations/${INVITATION_ID}/${action}`, { method: 'POST' })).status, 200);
    }
  });
  assert.deepEqual(calls, [
    { action: 'create', token: 'safe-test-token', roleId: ROLE_ID, inviteeId: PROFILE_ID, note: 'Join us.' },
    { action: 'accept' }, { action: 'reject' }, { action: 'cancel' },
  ]);
});

test('request lists contain safe profile summaries and no private identity fields', async () => {
  await withServer(appFor(repository()), async (baseUrl) => {
    const responses = await Promise.all([
      fetch(`${baseUrl}/api/me/project-applications`),
      fetch(`${baseUrl}/api/projects/${PROJECT_ID}/applications`),
      fetch(`${baseUrl}/api/me/project-invitations`),
      fetch(`${baseUrl}/api/projects/${PROJECT_ID}/invitations`),
    ]);
    for (const response of responses) {
      assert.equal(response.status, 200);
      const serialized = JSON.stringify(await response.json());
      assert.doesNotMatch(serialized, /email|telegram_user_id|preferred_lang|oauth|private_settings/i);
    }
  });
});
