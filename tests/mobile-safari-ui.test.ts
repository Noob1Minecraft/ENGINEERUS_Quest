import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = (file: string) => readFileSync(path.resolve(file), 'utf8');

test('iPhone viewport and shared shell account for Safari safe areas', () => {
  const html = source('index.html');
  const css = source('src/index.css');

  assert.match(html, /width=device-width, initial-scale=1\.0, viewport-fit=cover/u);
  assert.match(css, /-webkit-text-size-adjust:\s*100%/u);
  assert.match(css, /eq-header[^}]*safe-area-inset-top/su);
  assert.match(css, /eq-bottom-nav[^}]*safe-area-inset-bottom/su);
  assert.match(css, /eq-app__main[^}]*safe-area-inset-bottom/su);
  assert.match(css, /eq-app__main--workspace[^}]*100svh[^}]*100dvh/su);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x\s*:\s*hidden/su);
});

test('mobile forms avoid Safari focus zoom and common controls expose touch-sized targets', () => {
  const css = source('src/index.css');

  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\):not\(\[type='file'\]\)[^}]*font-size:\s*1rem/u);
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*eq-language__trigger[^}]*min-height:\s*2\.75rem/u);
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*eq-icon-button[^}]*min-width:\s*2\.75rem[^}]*min-height:\s*2\.75rem/u);
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*eq-button[^}]*min-height:\s*2\.75rem/u);
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*eq-app__main button[^}]*min-height:\s*2\.75rem/u);
  assert.match(css, /eq-ai-view-switcher \+ button[^}]*min-width:\s*2\.75rem/u);
});

test('mobile product destinations prioritize their actual content over repeated account stats', () => {
  const app = source('src/App.tsx');
  const css = source('src/index.css');

  assert.match(app, /className="eq-context-stats"[\s\S]*<ProfileStats/u);
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*\.eq-context-stats \{ display: none; \}/u);
});

test('mobile dialogs and scrolling workspaces remain bounded and independently scrollable', () => {
  const css = source('src/index.css');

  assert.match(css, /eq-dialog-backdrop[^}]*overflow-y:\s*auto[^}]*safe-area-inset-top/su);
  assert.match(css, /eq-dialog[^}]*max-height:[^}]*100dvh[^}]*overflow-y:\s*auto[^}]*-webkit-overflow-scrolling:\s*touch/su);
  assert.match(css, /eq-start-conversation[^}]*100vh[^}]*100dvh[^}]*overflow-y:\s*auto[^}]*-webkit-overflow-scrolling:\s*touch/su);
  assert.match(css, /eq-direct-chat__messages[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain[^}]*-webkit-overflow-scrolling:\s*touch/su);
  assert.match(css, /eq-ai-transcript[^}]*overscroll-behavior:\s*contain[^}]*-webkit-overflow-scrolling:\s*touch/su);
  assert.match(css, /@media \(max-width: 47\.999rem\) and \(max-height: 40rem\)[\s\S]*eq-app__main--workspace \{ min-height: 0; \}/u);
  assert.match(css, /max-height: 40rem\)[\s\S]*eq-ai-workspace \.eq-ai-prompts \{ display: none; \}/u);
});
