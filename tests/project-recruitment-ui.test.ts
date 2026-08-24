import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  acceptProjectApplication,
  acceptProjectInvitation,
  applyToProjectRole,
  cancelProjectInvitation,
  closeProjectRole,
  createProjectRole,
  inviteToProjectRole,
  listMyProjectApplications,
  listMyProjectInvitations,
  listProjectApplications,
  listProjectInvitations,
  listProjectRoles,
  rejectProjectApplication,
  rejectProjectInvitation,
  updateProjectRole,
  withdrawProjectApplication,
  type ProjectFetcher,
} from '../src/projects/projectApi';
import type { ProjectApplication, ProjectInvitation, ProjectRole } from '../src/types';

const PROJECT_ID = 'b1000000-0000-4000-8000-000000000001';
const ROLE_ID = 'c1000000-0000-4000-8000-000000000001';
const APPLICATION_ID = 'd1000000-0000-4000-8000-000000000001';
const INVITATION_ID = 'e1000000-0000-4000-8000-000000000001';

const role = { id: ROLE_ID } as ProjectRole;
const application = { id: APPLICATION_ID } as ProjectApplication;
const invitation = { id: INVITATION_ID } as ProjectInvitation;

test('role API helpers use explicit create, edit, close, and list endpoints', async () => {
  const calls: Array<{ endpoint: string; method?: string }> = [];
  const fetcher: ProjectFetcher = async <T>(endpoint: string, options?: RequestInit) => {
    calls.push({ endpoint, method: options?.method });
    return (endpoint.endsWith('/roles') && !options ? { roles: [role] } : { role, closed: true }) as T;
  };
  await listProjectRoles(PROJECT_ID, fetcher);
  await createProjectRole(PROJECT_ID, { title: 'Designer' }, fetcher);
  await updateProjectRole(ROLE_ID, { status: 'closed' }, fetcher);
  await closeProjectRole(ROLE_ID, fetcher);
  assert.deepEqual(calls, [
    { endpoint: `/api/projects/${PROJECT_ID}/roles`, method: undefined },
    { endpoint: `/api/projects/${PROJECT_ID}/roles`, method: 'POST' },
    { endpoint: `/api/project-roles/${ROLE_ID}`, method: 'PATCH' },
    { endpoint: `/api/project-roles/${ROLE_ID}`, method: 'DELETE' },
  ]);
});

test('application helpers expose apply, owner list, accept, reject, and withdraw actions', async () => {
  const calls: Array<{ endpoint: string; method?: string }> = [];
  const fetcher: ProjectFetcher = async <T>(endpoint: string, options?: RequestInit) => {
    calls.push({ endpoint, method: options?.method });
    return (endpoint.includes('/applications') && !options ? { applications: [application] } : { application }) as T;
  };
  await applyToProjectRole(ROLE_ID, 'Ready', fetcher);
  await listMyProjectApplications(fetcher);
  await listProjectApplications(PROJECT_ID, fetcher);
  await acceptProjectApplication(APPLICATION_ID, fetcher);
  await rejectProjectApplication(APPLICATION_ID, fetcher);
  await withdrawProjectApplication(APPLICATION_ID, fetcher);
  assert.deepEqual(calls.map(({ endpoint }) => endpoint), [
    `/api/project-roles/${ROLE_ID}/applications`, '/api/me/project-applications',
    `/api/projects/${PROJECT_ID}/applications`, `/api/project-applications/${APPLICATION_ID}/accept`,
    `/api/project-applications/${APPLICATION_ID}/reject`, `/api/project-applications/${APPLICATION_ID}/withdraw`,
  ]);
});

test('invitation helpers expose invite, owner/invitee lists, accept, reject, and cancel actions', async () => {
  const calls: string[] = [];
  const fetcher: ProjectFetcher = async <T>(endpoint: string, options?: RequestInit) => {
    calls.push(`${options?.method ?? 'GET'} ${endpoint}`);
    return (endpoint.includes('/invitations') && !options ? { invitations: [invitation] } : { invitation }) as T;
  };
  await inviteToProjectRole(ROLE_ID, 'a1000000-0000-4000-8000-000000000002', '', fetcher);
  await listMyProjectInvitations(fetcher);
  await listProjectInvitations(PROJECT_ID, fetcher);
  await acceptProjectInvitation(INVITATION_ID, fetcher);
  await rejectProjectInvitation(INVITATION_ID, fetcher);
  await cancelProjectInvitation(INVITATION_ID, fetcher);
  assert.deepEqual(calls, [
    `POST /api/project-roles/${ROLE_ID}/invitations`, 'GET /api/me/project-invitations',
    `GET /api/projects/${PROJECT_ID}/invitations`, `POST /api/project-invitations/${INVITATION_ID}/accept`,
    `POST /api/project-invitations/${INVITATION_ID}/reject`, `POST /api/project-invitations/${INVITATION_ID}/cancel`,
  ]);
});

test('recruitment UI includes required/optional skills and all guarded request states without private fields', () => {
  const source = readFileSync(path.resolve('src/components/ProjectRecruitmentPanel.tsx'), 'utf8');
  assert.match(source, /Required and optional skills/);
  assert.match(source, /No project roles yet/);
  assert.match(source, /No applications/);
  assert.match(source, /No invitations/);
  assert.match(source, /filled/);
  assert.match(source, /closed/);
  assert.match(source, /withdrawProjectApplication/);
  assert.match(source, /cancelProjectInvitation/);
  assert.doesNotMatch(source, /email|telegram_user_id|preferred_lang|oauth|private_settings/i);
});
