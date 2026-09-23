import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { activeChatStorageKey, buildConversationTitle, clearChatDraft, loadChatDraft, storeChatDraft } from '../src/ai/chatWorkspace';

const assistant = readFileSync(new URL('../src/components/AIAssistantTab.tsx', import.meta.url), 'utf8');
const picker = readFileSync(new URL('../src/components/AiAttachmentPicker.tsx', import.meta.url), 'utf8');
const header = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');

test('conversation title is deterministic, bounded, and derived only from canonical message text', () => {
  assert.equal(buildConversationTitle('  Как   работает вал?  '), 'Как работает вал?');
  assert.equal(buildConversationTitle('x'.repeat(100)).length, 72);
  assert.equal(buildConversationTitle('x'.repeat(100)).endsWith('…'), true);
  assert.doesNotMatch(buildConversationTitle('Что на схеме?'), /document|image|attachment/iu);
});

test('active chat uses an account-scoped key while drafts stay isolated in memory', () => {
  assert.equal(activeChatStorageKey('user-a'), 'engineerus:ai:active-chat:user-a');
  storeChatDraft('user-a', 'chat-a', 'private draft');
  assert.equal(loadChatDraft('user-a', 'chat-a'), 'private draft');
  assert.equal(loadChatDraft('user-b', 'chat-a'), '');
  clearChatDraft('user-a', 'chat-a');
  assert.equal(loadChatDraft('user-a', 'chat-a'), '');
  assert.match(assistant, /sessionStorage\.setItem\(activeChatStorageKey/);
  assert.match(assistant, /loadChatDraft/);
  assert.doesNotMatch(assistant, /sessionStorage\.(?:getItem|setItem)\([^\n]*draft/);
});

test('Tutor composer reuses owned document and image APIs with explicit removable context', () => {
  assert.match(picker, /listDocuments\(\)/);
  assert.match(picker, /listImages\(\)/);
  assert.match(picker, /uploadDocument\(file\)/);
  assert.match(picker, /uploadImage\(file\)/);
  assert.match(picker, /status === 'ready'/);
  assert.match(picker, /requestAnimationFrame\(\(\) => trigger\.current\?\.focus\(\)\)/);
  assert.match(assistant, /document_id: submissionDocumentId/);
  assert.match(assistant, /image_ids: submissionImageIds/);
  assert.match(assistant, /onSelectDocumentContext\?\.\(null\)/);
  assert.match(assistant, /onSelectImageContext\?\.\(\[\]\)/);
});

test('workspace remains backend-persistent and avoids local message history', () => {
  assert.match(assistant, /\/api\/chats\?limit=20/);
  assert.match(assistant, /\/api\/chats\/\$\{encodeURIComponent\(activeSessionId\)\}\/messages\?limit=50/);
  assert.match(assistant, /headers: \{ 'Idempotency-Key': requestId \}/);
  assert.doesNotMatch(assistant, /localStorage\.(?:setItem|getItem)\([^\n]*(?:messages|sessions|chats)/);
});

test('message submission is optimistic and cannot be blocked by cosmetic chat renaming', () => {
  assert.ok(assistant.indexOf('createOptimisticUserMessage') < assistant.indexOf("apiFetch<ModuleAiResponse>('/api/module'"));
  assert.match(assistant, /Renaming is cosmetic and must never prevent message persistence/);
  assert.match(assistant, /sendInFlightRef\.current/);
  assert.match(assistant, /canonicalAiRequestId/);
  assert.match(assistant, /onClick=\{\(\) => void handleSendPrompt\(undefined, failedSubmission\)\}/);
});

test('public Beta badge is removed without removing beta feedback', () => {
  assert.doesNotMatch(header, /eq-brand__beta|>Beta</);
  assert.match(header, /onOpenFeedback/);
  assert.match(header, /Send beta feedback|Отправить бета-отзыв/);
});
