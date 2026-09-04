import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = (file: string) => readFileSync(path.resolve(file), 'utf8');

test('Tutor polish keeps long engineering content bounded and composer-safe', () => {
  const css = source('src/index.css');
  assert.match(css, /eq-ai-message :where\(pre, table\)[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/su);
  assert.match(css, /eq-ai-transcript[^}]*scroll-padding-block:\s*1rem 5\.5rem/su);
  assert.match(css, /eq-ai-refined \.eq-context-chip[^}]*max-width:\s*min\(100%, 18rem\)/su);
  assert.match(css, /eq-ai-history-drawer__panel[^}]*width:\s*min\(20rem, 92%\)/su);
});

test('hero and information strip retain structure with lighter visual integration', () => {
  const app = source('src/App.tsx');
  const css = source('src/index.css');
  assert.match(app, /eq-home-hero__grid/u);
  assert.match(app, /eq-home-links/u);
  assert.match(css, /eq-home-hero__figure::after/u);
  assert.match(css, /eq-home-link__icon[^}]*width:\s*1\.55rem/su);
  assert.doesNotMatch(css, /eq-home-hero__figure::after[^}]*glow/su);
});

test('compact semantic footer replaces utility-heavy footer without losing content', () => {
  const app = source('src/App.tsx');
  const css = source('src/index.css');
  assert.match(app, /<footer className=\{`eq-footer\$\{activeTab === 'ai' \? ' eq-footer--workspace' : ''\}`\}>/u);
  assert.match(app, /eq-footer__institutions/u);
  assert.match(app, /eq-footer__credits/u);
  assert.match(app, /t\.foundedBy/u);
  assert.match(app, /t\.attributionCaption/u);
  assert.match(css, /eq-footer[^}]*safe-area-inset-bottom/su);
  assert.match(css, /eq-footer--workspace \{ display:\s*none; \}/u);
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*eq-footer__institutions \{ display: none;/u);
});

test('sidebar density and typography remain readable without widening navigation', () => {
  const css = source('src/index.css');
  assert.match(css, /--sidebar-width:\s*16\.25rem/u);
  assert.match(css, /eq-sidebar__label[^}]*ui-monospace/su);
  assert.match(css, /eq-sidebar__item[^}]*min-height:\s*2\.35rem/su);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x\s*:\s*hidden/su);
});
