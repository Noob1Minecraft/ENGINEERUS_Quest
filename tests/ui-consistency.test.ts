import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(file: string): string {
  return readFileSync(path.resolve(file), 'utf8');
}

test('legacy product destinations use the current semantic Engineerus hierarchy', () => {
  const quests = source('src/components/QuestsTab.tsx');
  const learning = source('src/components/RoadmapBooksTab.tsx');
  const leaderboard = source('src/components/LeaderboardTab.tsx');
  for (const required of ['eq-legacy-page', 'eq-quest-list', 'eq-quest-row', 'eq-quest-row__notice']) assert.match(quests, new RegExp(required));
  for (const required of ['eq-legacy-page', 'eq-roadmap-list', 'eq-resource-list', 'eq-resource-row']) assert.match(learning, new RegExp(required));
  for (const required of ['eq-legacy-page', 'eq-leaderboard__list', 'eq-leaderboard-row', 'is-current']) assert.match(leaderboard, new RegExp(required));
});

test('quest actions retain behavior without decorative AI styling or card-per-item shells', () => {
  const sourceText = source('src/components/QuestsTab.tsx');
  assert.match(sourceText, /handleQuestButtonClick/u);
  assert.match(sourceText, /onCompleteQuest/u);
  assert.match(sourceText, /onNavigateToQuest/u);
  assert.doesNotMatch(sourceText, /Sparkles|shadow-(?:sm|md|lg|xl|2xl)|rounded-2xl/u);
});

test('learning filters expose non-color-only selected state and keep safe source links', () => {
  const sourceText = source('src/components/RoadmapBooksTab.tsx');
  assert.match(sourceText, /aria-pressed=\{selectedLangFilter === filter\}/u);
  assert.match(sourceText, /aria-pressed=\{selectedCategory === filter\}/u);
  assert.match(sourceText, /target="_blank"/u);
  assert.match(sourceText, /rel="noopener noreferrer"/u);
  assert.doesNotMatch(sourceText, /bg-purple|shadow-(?:sm|md|lg|xl|2xl)|rounded-2xl/u);
});

test('leaderboard removes glow and nested summary cards while retaining explicit current-user status', () => {
  const sourceText = source('src/components/LeaderboardTab.tsx');
  assert.match(sourceText, /t\.yourAccount/u);
  assert.match(sourceText, /role="list"/u);
  assert.match(sourceText, /role="listitem"/u);
  assert.doesNotMatch(sourceText, /gradient|blur-3xl|shadow-(?:sm|md|lg|xl|2xl)|rounded-2xl/u);
});

test('legacy dialogs share the current modal and form treatment', () => {
  const sources = ['src/components/AuthModal.tsx', 'src/components/OnboardingModal.tsx', 'src/components/BetaFeedbackModal.tsx'].map(source).join('\n');
  const focusHook = source('src/hooks/useDialogFocus.ts');
  assert.match(sources, /eq-dialog-backdrop/u);
  assert.match(sources, /aria-modal="true"/u);
  assert.equal((sources.match(/useDialogFocus\(/gu) ?? []).length, 3);
  assert.equal((sources.match(/tabIndex=\{-1\}/gu) ?? []).length, 4);
  assert.match(focusHook, /requestAnimationFrame/u);
  assert.match(focusHook, /event\.key === 'Escape'/u);
  assert.match(focusHook, /event\.key !== 'Tab'/u);
  assert.match(focusHook, /previousFocus\.current\?\.focus/u);
  assert.match(focusHook, /first\.focus\(\)/u);
  assert.match(focusHook, /last\.focus\(\)/u);
  assert.doesNotMatch(sources, /backdrop-blur|shadow-2xl|bg-gradient-to|bg-linear-to/u);
});

test('affected dialogs choose visible meaningful initial focus targets', () => {
  const feedback = source('src/components/BetaFeedbackModal.tsx');
  const auth = source('src/components/AuthModal.tsx');
  const onboarding = source('src/components/OnboardingModal.tsx');
  assert.match(feedback, /initialFocusRef: categoryRef/u);
  assert.match(feedback, /<select ref=\{categoryRef\}/u);
  assert.match(auth, /initialFocusRef: emailInputRef/u);
  assert.match(auth, /ref=\{emailInputRef\}[\s\S]*type="email"/u);
  assert.match(auth, /type="email"[\s\S]*aria-label="Email"/u);
  assert.match(onboarding, /initialFocusRef: closeButtonRef/u);
  assert.match(onboarding, /ref=\{closeButtonRef\}/u);
});

test('consistency CSS keeps content bounded without masking structural overflow', () => {
  const css = source('src/index.css');
  for (const required of ['eq-legacy-page', 'eq-roadmap-list', 'eq-resource-row', 'eq-leaderboard-row', 'eq-dialog__form-grid']) assert.match(css, new RegExp(required));
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.eq-roadmap-list \{ grid-template-columns: minmax\(0, 1fr\); \}/u);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x\s*:\s*hidden/su);
});
