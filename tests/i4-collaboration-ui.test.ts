import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(file: string): string {
  return readFileSync(path.resolve(file), 'utf8');
}

test('Projects and recruitment use structured hierarchy with localized contextual states', () => {
  const projects = source('src/components/ProjectsTab.tsx');
  const recruitment = source('src/components/ProjectRecruitmentPanel.tsx');
  for (const required of ['eq-project-row', 'eq-project-detail__identity', 'eq-project-detail__brief', 'eq-project-filters', 'EmptyState', 'LoadingState']) assert.match(projects, new RegExp(required));
  for (const required of ['eq-role-list', 'eq-role-row', 'eq-request-row', 'eq-requests__group', 'RoleStatus', 'accepted', 'pending', 'rejected']) assert.match(recruitment, new RegExp(required));
  assert.match(projects, /aria-pressed/);
  assert.match(recruitment, /aria-labelledby="project-roles-title"/);
  assert.doesNotMatch(`${projects}\n${recruitment}`, /telegram_user_id|preferred_lang|oauth|private_settings|email/i);
});

test('EngiMatch presents deterministic engineering evidence without social matching metaphors', () => {
  const engimatch = source('src/components/EngiMatchTab.tsx');
  for (const required of ['eq-match-workspace', 'eq-match-row__evidence', 'match.reasons', 'missing_required_skills', 'engi-match-v1', 'aria-pressed']) assert.match(engimatch, new RegExp(required));
  assert.doesNotMatch(engimatch, /swipe|attractiveness|LeaderboardEntry|telegram_user_id|preferred_lang|allow_direct_messages|email|oauth/i);
  assert.doesNotMatch(engimatch, /copy\.score|match\.score/);
});

test('Messages keep human chat distinct and expose an eligible-only accessible start flow', () => {
  const messages = source('src/components/DirectChatTab.tsx');
  const css = source('src/index.css');
  for (const required of ['eq-human-message', 'eq-conversation-row', 'eq-start-conversation', 'aria-modal="true"', 'useDialogFocus', 'startDialogRef']) assert.match(messages, new RegExp(required.replace(/[?.]/g, '\\$&')));
  const focusHook = source('src/hooks/useDialogFocus.ts');
  assert.match(focusHook, /event\.key === 'Escape'/);
  assert.match(focusHook, /previousFocus\.current\?\.focus/);
  assert.match(messages, /acceptedCandidates/);
  assert.match(messages, /new Map/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /eq-direct-chat__list--mobile-hidden/);
  assert.doesNotMatch(messages, /AIAssistantTab|Groq|chat_sessions|chat_messages|searchProfiles/i);
});

test('I4 responsive rules avoid fixed-width content and preserve visible selected states', () => {
  const css = source('src/index.css');
  for (const required of ['minmax(0, 1fr)', 'aria-pressed="true"', 'overflow-wrap: anywhere', 'eq-project-filters', 'eq-match-row', 'eq-request-row']) assert.match(css, new RegExp(required.replace(/[()]/g, '\\$&')));
  assert.match(css, /\.eq-project-row \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x:\s*hidden/is);
});
