import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.TEST_SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(url)) {
  throw new Error('Project recruitment concurrency tests require the local loopback Supabase stack.');
}

type Identity = { id: string; client: SupabaseClient };

async function identity(admin: SupabaseClient, label: string): Promise<Identity> {
  const email = `phase-c-${label}-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9a!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('Local user creation failed.');
  const client = createClient(url!, publishableKey!, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error('Local sign-in failed.');
  return { id: created.data.user.id, client };
}

test('concurrent acceptance of the final role slot creates exactly one member', async () => {
  const admin = createClient(url!, secretKey!, { auth: { persistSession: false } });
  const owner = await identity(admin, 'owner');
  const first = await identity(admin, 'first');
  const second = await identity(admin, 'second');
  let projectId: string | null = null;

  try {
    const projectResult = await owner.client.from('projects').insert({
      title: 'Concurrent final slot', status: 'open', visibility: 'authenticated',
    }).select('id').single();
    if (projectResult.error) throw projectResult.error;
    projectId = projectResult.data.id;

    const roleResult = await owner.client.rpc('create_project_role', {
      p_project_id: projectResult.data.id,
      p_title: 'Single opening',
      p_positions_total: 1,
      p_skill_ids: [], p_skill_requirements: [], p_skill_weights: [],
    });
    if (roleResult.error) throw roleResult.error;
    const roleId = roleResult.data as string;

    const [firstApplication, secondApplication] = await Promise.all([
      first.client.rpc('create_project_application', { p_role_id: roleId, p_note: 'First' }),
      second.client.rpc('create_project_application', { p_role_id: roleId, p_note: 'Second' }),
    ]);
    if (firstApplication.error) throw firstApplication.error;
    if (secondApplication.error) throw secondApplication.error;

    const attempts = await Promise.all([
      owner.client.rpc('accept_project_application', { p_application_id: firstApplication.data }),
      owner.client.rpc('accept_project_application', { p_application_id: secondApplication.data }),
    ]);
    assert.equal(attempts.filter(({ error }) => !error).length, 1, 'exactly one contender must win');
    assert.equal(attempts.filter(({ error }) => error).length, 1, 'the losing contender must fail closed');

    const members = await owner.client.from('project_members').select('user_id').eq('role_id', roleId);
    if (members.error) throw members.error;
    assert.equal(members.data.length, 1);

    const role = await owner.client.from('project_roles').select('status').eq('id', roleId).single();
    if (role.error) throw role.error;
    assert.equal(role.data.status, 'filled');

    const applications = await owner.client.from('project_applications').select('status').eq('role_id', roleId);
    if (applications.error) throw applications.error;
    assert.deepEqual(applications.data.map(({ status }) => status).sort(), ['accepted', 'cancelled']);
  } finally {
    if (projectId) {
      assert.match(projectId, /^[0-9a-f-]{36}$/i);
      execFileSync(process.execPath, [
        path.resolve('node_modules/supabase/dist/supabase.js'),
        'db', 'query', '--local',
        `delete from public.projects where id = '${projectId}'::uuid;`,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
    }
    const deleted = await Promise.all([
      admin.auth.admin.deleteUser(owner.id),
      admin.auth.admin.deleteUser(first.id),
      admin.auth.admin.deleteUser(second.id),
    ]);
    for (const result of deleted) {
      if (result.error) throw result.error;
    }
  }
});
