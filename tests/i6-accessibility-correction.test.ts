import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resolveStoredLanguage, syncDocumentLanguage } from '../src/language';

function source(file: string): string {
  return readFileSync(path.resolve(file), 'utf8');
}

test('AI rename and delete dialogs restore their exact conversation management opener', () => {
  const ai = source('src/components/AIAssistantTab.tsx');
  const focusHook = source('src/hooks/useDialogFocus.ts');

  assert.match(ai, /dialogReturnFocusRef\.current = event\.currentTarget;/u);
  assert.doesNotMatch(ai, /dialogReturnFocusRef\.current = sessionMenuTriggersRef/u);
  assert.match(ai, /returnFocusRef: dialogReturnFocusRef/u);
  assert.match(focusHook, /const returnTarget = returnFocusRef\?\.current;/u);
  assert.match(focusHook, /returnTarget\?\.isConnected/u);
  assert.match(focusHook, /previousFocus\.current\?\.isConnected/u);
});

test('dialog focus restoration applies to Escape and Cancel through shared close state', () => {
  const ai = source('src/components/AIAssistantTab.tsx');
  const focusHook = source('src/hooks/useDialogFocus.ts');

  assert.match(ai, /onClose: closeManagementDialog/u);
  assert.match(ai, /onClick=\{closeManagementDialog\}/u);
  assert.match(focusHook, /if \(event\.key === 'Escape'\)/u);
  assert.match(focusHook, /closeRef\.current\(\)/u);
});

for (const language of ['ru', 'kk', 'en'] as const) {
  test(`persisted and runtime ${language.toUpperCase()} language synchronizes html lang`, () => {
    const root = { lang: 'en' };
    const resolved = resolveStoredLanguage(language);
    syncDocumentLanguage(resolved, root);
    assert.equal(resolved, language);
    assert.equal(root.lang, language);
  });
}

test('unsupported persisted language uses the existing Russian fallback', () => {
  const root = { lang: 'en' };
  const resolved = resolveStoredLanguage('stale');
  syncDocumentLanguage(resolved, root);
  assert.equal(resolved, 'ru');
  assert.equal(root.lang, 'ru');
});

test('App uses one language state for persistence and document semantics', () => {
  const app = source('src/App.tsx');
  assert.match(app, /useState<Language>\(\(\) => resolveStoredLanguage\(localStorage\.getItem\('lang'\)\)\)/u);
  assert.match(app, /syncDocumentLanguage\(lang\);\s*localStorage\.setItem\('lang', lang\);/u);
  assert.equal((app.match(/syncDocumentLanguage\(lang\)/gu) ?? []).length, 1);
});
