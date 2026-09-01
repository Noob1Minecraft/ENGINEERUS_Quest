import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.TEST_SUPABASE_SECRET_KEY;
if (!url || !publishableKey || !secretKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(url)) {
  throw new Error('Direct chat concurrency tests require the local loopback Supabase stack.');
}
type Identity = { id: string; client: SupabaseClient };
async function identity(admin: SupabaseClient, label: string): Promise<Identity> {
  const email = `phase-e-${label}-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9a!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('Local user creation failed.');
  const client = createClient(url!, publishableKey!, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user.id, client };
}

test('concurrent conversation creation and message retry remain single-row idempotent', async () => {
  const admin = createClient(url!, secretKey!, { auth: { persistSession: false } });
  const owner = await identity(admin, 'owner');
  const member = await identity(admin, 'member');
  let projectId: string | null = null;
  try {
    const project = await owner.client.from('projects').insert({ title: 'Direct chat concurrency', status: 'open', visibility: 'private' }).select('id').single();
    if (project.error) throw project.error; projectId = project.data.id;
    const role = await owner.client.rpc('create_project_role', {
      p_project_id: projectId, p_title: 'Collaborator', p_positions_total: 1,
      p_skill_ids: [], p_skill_requirements: [], p_skill_weights: [],
    });
    if (role.error) throw role.error;
    const application = await member.client.rpc('create_project_application', { p_role_id: role.data, p_note: '' });
    if (application.error) throw application.error;
    const accepted = await owner.client.rpc('accept_project_application', { p_application_id: application.data });
    if (accepted.error) throw accepted.error;

    const attempts = await Promise.all([
      owner.client.rpc('get_or_create_direct_conversation', { p_target_profile_id: member.id, p_project_id: projectId }),
      member.client.rpc('get_or_create_direct_conversation', { p_target_profile_id: owner.id, p_project_id: projectId }),
    ]);
    for (const attempt of attempts) if (attempt.error) throw attempt.error;
    assert.equal(attempts[0].data, attempts[1].data);
    const conversationId = attempts[0].data as string;

    const clientMessageId = crypto.randomUUID();
    const sends = await Promise.all([
      owner.client.rpc('send_direct_message', { p_conversation_id: conversationId, p_client_message_id: clientMessageId, p_content: 'one logical send' }),
      owner.client.rpc('send_direct_message', { p_conversation_id: conversationId, p_client_message_id: clientMessageId, p_content: 'one logical send' }),
    ]);
    for (const send of sends) if (send.error) throw send.error;
    assert.equal(sends[0].data[0].id, sends[1].data[0].id);
    const rows = await owner.client.from('direct_messages').select('id').eq('conversation_id', conversationId);
    if (rows.error) throw rows.error;
    assert.equal(rows.data.length, 1);
  } finally {
    if (projectId) execFileSync(process.execPath, [path.resolve('node_modules/supabase/dist/supabase.js'), 'db', 'query', '--local', `delete from public.projects where id='${projectId}'::uuid;`], { stdio: ['ignore','ignore','pipe'] });
    for (const id of [owner.id, member.id]) { const result = await admin.auth.admin.deleteUser(id); if (result.error) throw result.error; }
  }
});
