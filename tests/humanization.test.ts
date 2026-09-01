import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const assistant = readFileSync(new URL('../src/components/AIAssistantTab.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/components/GamificationPanel.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/components/AppSidebar.tsx', import.meta.url), 'utf8');
const copy = readFileSync(new URL('../src/data.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('guest workspace uses a restrained technical motif instead of glow decoration', () => {
  assert.match(app, /eq-home-hero/);
  assert.match(app, /STUDY \/ BUILD \/ VERIFY/);
  assert.doesNotMatch(app, /blur-3xl|bg-gradient-to-br|Sparkles/);
  assert.match(css, /eq-home-hero__figure[\s\S]*linear-gradient[\s\S]*background-size: 24px 24px/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x:\s*hidden/s);
});

test('Tutor workspace keeps behavior while removing generic AI visual treatment', () => {
  assert.match(assistant, /eq-ai-workspace/);
  assert.match(assistant, /eq-ai-chat-frame/);
  assert.match(assistant, /aria-pressed=\{isSelected\}/);
  assert.doesNotMatch(assistant, /Sparkles|from-blue-600 to-indigo-600|blur-3xl/);
  assert.match(assistant, /Проверяю условия и готовлю инженерный ответ/);
  assert.match(assistant, /Шарттарды тексеріп, инженерлік жауап дайындап жатырмын/);
  assert.match(assistant, /Checking the given conditions and preparing an engineering answer/);
});

test('Dashboard and sidebar use engineering cues without decorative sparkles', () => {
  assert.match(dashboard, /DraftingCompass/);
  assert.match(dashboard, /Gauge/);
  assert.doesNotMatch(dashboard, /Sparkles/);
  assert.match(sidebar, /eq-sidebar__note-index/);
  assert.doesNotMatch(sidebar, /Sparkles/);
});

test('human-facing workspace copy is present in Russian, Kazakh, and English', () => {
  assert.match(copy, /Рабочее пространство студента-инженера/);
  assert.match(copy, /Инженер-студенттің жұмыс кеңістігі/);
  assert.match(copy, /A workspace for engineering students/);
});
