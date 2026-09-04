import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { TRANSLATIONS } from '../src/data';
import type { Language } from '../src/types';

const assistant = readFileSync(new URL('../src/components/AIAssistantTab.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

const tutorKeys = [
  'aiAssistantTitle', 'aiAssistantDesc', 'engineeringChat', 'savedSolutions', 'newChat', 'chatsCount',
  'aiModuleNavLabel', 'aiExamples', 'aiEmptyTitle', 'aiEmptyBody', 'aiComposerPlaceholder',
  'aiComposerLabel', 'aiSend', 'aiSavedChatsLabel', 'aiCloseHistory', 'fullscreen', 'exitFullscreen',
  'aiExampleTutorBeam', 'aiExampleTutorCarnot', 'aiExampleTutorMotion',
  'aiExampleMaterialSteel', 'aiExampleMaterialUav', 'aiExampleMaterialWind',
  'aiExamplePatentBridge', 'aiExamplePatentClearance', 'aiExamplePatentWater',
  'aiExampleLegalSeismic', 'aiExampleLegalContract', 'aiExampleLegalPump',
  'aiExampleMatchRoles', 'aiExampleMatchEquity', 'aiExampleMatchEmbedded',
  'aiSearchSaved', 'aiSavedEmptyTitle', 'aiSavedNoMatches', 'aiSavedEmptyBody', 'aiSavedNoMatchesBody',
  'aiAskQuestion', 'aiCopyAnswer', 'aiDownloadAnswer', 'aiDeleteSaved', 'aiQuestionLabel',
] as const;

for (const language of ['ru', 'kk', 'en'] as Language[]) {
  test(`${language.toUpperCase()} Tutor copy is complete and compact`, () => {
    const copy = TRANSLATIONS[language];
    for (const key of tutorKeys) assert.ok(copy[key]?.trim(), `${language}.${key}`);
    for (const key of tutorKeys.filter((key) => key.startsWith('aiExample'))) {
      assert.ok(copy[key].length <= 42, `${language}.${key} is too long`);
    }
  });
}

test('Tutor uses one localized heading and removes redundant first-screen labels', () => {
  assert.match(assistant, /<h2[\s\S]*\{t\.aiAssistantTitle\}[\s\S]*<\/h2>/u);
  assert.doesNotMatch(assistant, /t\.aiCoreTitle|t\.session|Prompt suggestion for module|Подсказка для модуля/u);
  assert.doesNotMatch(assistant, /Материалы ГОСТ|Patent Draft|Codes & Standards/u);
  assert.doesNotMatch(assistant, /Инженерный сеанс|Engineering Session|Инженерлік сеанс/u);
});

test('examples are localized, concise, keyboard buttons inside the empty state', () => {
  assert.match(assistant, /const PRESET_KEYS/u);
  assert.match(assistant, /PRESET_KEYS\[selectedModule\][\s\S]*\.map\(\(key\) => t\[key\]\)/u);
  assert.match(assistant, /messages\.length === 0[\s\S]*t\.aiEmptyTitle[\s\S]*t\.aiEmptyBody/u);
  assert.match(assistant, /className="eq-ai-empty[\s\S]*<button[\s\S]*type="button"/u);
  assert.match(css, /eq-ai-empty \.eq-ai-prompt[^}]*min-width:\s*0[^}]*border-radius:\s*999px/su);
});

test('composer and accessibility labels follow runtime language state', () => {
  assert.match(assistant, /placeholder=\{t\.aiComposerPlaceholder\}/u);
  assert.match(assistant, /aria-label=\{t\.aiComposerLabel\}/u);
  assert.match(assistant, /aria-label=\{t\.aiModuleNavLabel\}/u);
  assert.match(assistant, /aria-label=\{t\.aiSavedChatsLabel\}/u);
  assert.match(assistant, /aria-label=\{t\.aiCloseHistory\}/u);
  assert.match(assistant, /aria-label=\{t\.aiSend\}/u);
  assert.match(assistant, /placeholder=\{t\.aiSearchSaved\}/u);
  assert.doesNotMatch(assistant, /Нет сохраненных решений|Задать вопрос ИИ|Скопировать ответ/u);
});

test('analytics and backend request behavior remain outside the polish diff', () => {
  assert.match(assistant, /headers: \{ 'Idempotency-Key': requestId \}/u);
  assert.match(assistant, /\/api\/module/u);
  assert.doesNotMatch(assistant, /trackProductEvent|ai_message_sent/u);
});
