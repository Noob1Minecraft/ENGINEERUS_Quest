import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  buildUrlForPath,
  resolveInitialLanguage,
  resolveStoredLanguage,
  syncDocumentLanguage,
  syncManualLanguageToUrl,
} from '../src/language';

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

for (const language of ['en', 'ru', 'kk'] as const) {
  test(`URL lang=${language} selects ${language.toUpperCase()} over a saved preference`, () => {
    assert.equal(resolveInitialLanguage(`?lang=${language}`, language === 'en' ? 'ru' : 'en'), language);
  });
}

test('an unsupported URL language falls back to the saved language and then the existing default', () => {
  assert.equal(resolveInitialLanguage('?lang=test', 'kk'), 'kk');
  assert.equal(resolveInitialLanguage('?lang=test', 'unsupported'), 'ru');
});

test('manual language switching updates an existing lang parameter without reloading', () => {
  let replacedUrl = '';
  const history = {
    state: { app: true },
    replaceState: (_state: unknown, _unused: string, url?: string | URL | null) => {
      replacedUrl = String(url ?? '');
    },
  };

  syncManualLanguageToUrl(
    'kk',
    { pathname: '/admin', search: '?filter=open&lang=en', hash: '#profile' },
    history,
  );

  assert.equal(replacedUrl, '/admin?filter=open&lang=kk#profile');
});

test('manual switching preserves existing URL behavior when no lang parameter is present', () => {
  let replaceCalls = 0;
  syncManualLanguageToUrl(
    'en',
    { pathname: '/', search: '?filter=open', hash: '' },
    {
      state: null,
      replaceState: () => {
        replaceCalls += 1;
      },
    },
  );
  assert.equal(replaceCalls, 0);
});

test('SPA route changes preserve language, other query parameters, and hash', () => {
  const location = { pathname: '/', search: '?lang=ru&filter=open', hash: '#profile' };
  assert.equal(buildUrlForPath('/admin', location), '/admin?lang=ru&filter=open#profile');
  assert.equal(buildUrlForPath('/', location), '/?lang=ru&filter=open#profile');
});

test('App uses one language state for persistence and document semantics', () => {
  const app = source('src/App.tsx');
  assert.match(app, /useState<Language>\(\(\) => resolveInitialLanguage\(window\.location\.search, localStorage\.getItem\('lang'\)\)\)/u);
  assert.match(app, /syncDocumentLanguage\(lang\);\s*localStorage\.setItem\('lang', lang\);/u);
  assert.match(app, /syncManualLanguageToUrl\(language\);\s*setLang\(language\);/u);
  assert.match(app, /setLang\(resolveInitialLanguage\(window\.location\.search, localStorage\.getItem\('lang'\)\)\);/u);
  assert.match(app, /buildUrlForPath\('\/admin'\)/u);
  assert.match(app, /buildUrlForPath\('\/'\)/u);
  assert.equal((app.match(/syncDocumentLanguage\(lang\)/gu) ?? []).length, 1);
});
