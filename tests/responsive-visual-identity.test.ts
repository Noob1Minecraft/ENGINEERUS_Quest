import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(file: string): string {
  return readFileSync(path.resolve(file), 'utf8');
}

test('official Engineerus logo asset is reused across shell, mobile navigation, and auth', () => {
  const logo = source('src/components/BrandLogo.tsx');
  const shell = source('src/components/Header.tsx') + source('src/components/AppSidebar.tsx');
  const mobile = source('src/components/BottomNav.tsx');
  const auth = source('src/components/AuthModal.tsx');

  assert.equal(existsSync(path.resolve('public/brand/engineerus-logo-source.jpg')), true);
  assert.equal(existsSync(path.resolve('public/brand/engineerus-logo.webp')), true);
  assert.match(logo, /alt=\{decorative \? '' : 'Engineerus Quest'\}/u);
  assert.match(logo, /width=\{565\}[\s\S]*height=\{362\}/u);
  for (const component of [shell, mobile, auth]) assert.match(component, /<BrandLogo/u);
});

test('corrective palette uses the approved warm paper, plum, teal, reward, and ink roles', () => {
  const css = source('src/index.css');
  for (const token of ['#fbf7f4', '#5c2a63', '#176e7a', '#f0356b', '#241a26']) {
    assert.match(css.toLowerCase(), new RegExp(token, 'u'));
  }
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x\s*:\s*hidden/su);
});

test('Tutor is a viewport workspace with independent transcript scrolling and a mobile history drawer', () => {
  const app = source('src/App.tsx');
  const assistant = source('src/components/AIAssistantTab.tsx');
  const css = source('src/index.css');

  assert.match(app, /eq-app__main--workspace/u);
  assert.match(assistant, /eq-ai-chat-column/u);
  assert.match(assistant, /eq-ai-chat-frame--embedded/u);
  assert.match(assistant, /eq-ai-history-drawer__backdrop/u);
  assert.match(css, /height:\s*calc\(100dvh/u);
  assert.match(css, /eq-ai-transcript[^}]*overscroll-behavior:\s*contain/su);
  assert.match(css, /eq-ai-history-drawer__panel[^}]*height:\s*100%/su);
  assert.match(css, /grid-template-columns:\s*clamp\(16\.25rem, 22vw, 19rem\) minmax\(0, 1fr\)/u);
  assert.match(css, /eq-ai-view-switcher[^}]*button\[class\*="bg-blue"\][^}]*color:\s*white/su);
});

test('responsive rules cover phone, tablet, and constrained laptop table layouts', () => {
  const css = source('src/index.css');
  assert.match(css, /@media \(max-width: 47\.999rem\)/u);
  assert.match(css, /@media \(min-width: 48rem\)/u);
  assert.match(css, /@media \(min-width: 64rem\)/u);
  assert.match(css, /@media \(max-width: 74\.999rem\)[\s\S]*eq-document-table__head \{ display: none;/u);
  assert.match(css, /env\(safe-area-inset-bottom\)/u);
});
