import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PRODUCT_EVENT_NAMES } from '../server/persistence/beta';

const read = (file: string) => readFileSync(path.resolve(file), 'utf8');

test('controlled beta event allowlist covers only the documented product journey', () => {
  assert.deepEqual(PRODUCT_EVENT_NAMES, [
    'signup_completed', 'login_completed', 'onboarding_started', 'onboarding_completed',
    'first_meaningful_action', 'ai_session_started', 'ai_message_sent',
    'quest_completed', 'learning_resource_opened', 'project_created',
    'project_application_submitted', 'project_applied', 'project_invitation_accepted',
    'engimatch_viewed', 'engimatch_action_taken', 'document_uploaded', 'image_uploaded',
    'direct_chat_started', 'direct_chat_opened', 'direct_message_sent',
    'invite_link_created', 'invite_link_opened', 'invited_user_registered', 'feedback_submitted',
    'daily_quest_completed', 'weekly_quest_completed', 'achievement_unlocked',
    'level_up', 'quest_chain_completed',
  ]);
});

test('authoritative successful routes record core events without user content metadata', () => {
  const cases = [
    ['server/routes/chats.ts', 'ai_session_started'],
    ['server/routes/ai.ts', 'ai_message_sent'],
    ['server/routes/quests.ts', 'quest_completed'],
    ['server/routes/projects.ts', 'project_created'],
    ['server/routes/projectRecruitment.ts', 'project_applied'],
    ['server/routes/engimatch.ts', 'engimatch_viewed'],
    ['server/routes/directChats.ts', 'direct_message_sent'],
  ] as const;
  for (const [file, eventName] of cases) {
    const source = read(file);
    assert.match(source, new RegExp(`trackProductEvent\\([^)]*${eventName}`, 'su'), `${file} records ${eventName}`);
  }
  const tracker = read('server/beta/trackProductEvent.ts');
  assert.match(tracker, /securityLogger\.warn\("product_event_record_failed", \{ eventName \}\)/u);
  assert.doesNotMatch(tracker, /securityLogger\.warn\([^;]*(?:userId|metadata|dedupeKey)/su);
  assert.match(tracker, /Product analytics must never fail a completed user action/u);
});

test('no third-party tracker, IP collection, browser fingerprint, or arbitrary client event schema is introduced', () => {
  const route = read('server/routes/beta.ts');
  const migration = read('supabase/migrations/20260826100337_controlled_beta_readiness_foundation.sql');
  assert.match(route, /z\.enum\(\["engimatch_viewed", "direct_chat_opened"\]\)/u);
  assert.doesNotMatch(`${route}\n${migration}`, /fingerprint|ip_address|google analytics|segment|mixpanel/iu);
  assert.match(migration, /'message', 'prompt', 'content', 'email', 'token', 'password'/u);
});
