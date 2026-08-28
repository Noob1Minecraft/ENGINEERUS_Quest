import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppSidebar } from '../src/components/AppSidebar';
import { BottomNav } from '../src/components/BottomNav';
import { Header } from '../src/components/Header';
import { APP_NAVIGATION_ITEMS } from '../src/components/appNavigation';
import { Button, ContextChip, ErrorState, LoadingState, ProgressBar, StatusBadge } from '../src/components/ui';
import type { UserProfile } from '../src/types';

const user: UserProfile = {
  id: '70000000-0000-4000-8000-000000000001',
  username: 'engineer',
  xp: 240,
  level: 3,
  streak: 4,
  completed_quests: [],
  achievements: [],
  requests_count: 0,
  material_count: 0,
  patent_count: 0,
  modules_used: [],
  preferred_lang: 'ru',
};

test('navigation registry preserves every existing product destination', () => {
  assert.deepEqual(APP_NAVIGATION_ITEMS.map(({ id }) => id).sort(), [
    'ai', 'documents', 'engimatch', 'home', 'leaderboard', 'messages', 'profile', 'projects', 'quests', 'roadmap',
  ]);
  assert.equal(new Set(APP_NAVIGATION_ITEMS.map(({ id }) => id)).size, APP_NAVIGATION_ITEMS.length);
});

test('desktop shell navigation exposes groups and a semantic active destination', () => {
  const markup = renderToStaticMarkup(React.createElement(AppSidebar, {
    activeTab: 'documents', language: 'ru', onSelectTab: () => undefined,
  }));
  for (const item of APP_NAVIGATION_ITEMS) assert.match(markup, new RegExp(item.labels.ru));
  assert.match(markup, /aria-current="page"[^>]*class="[^"]*is-active[^"]*"[^>]*>[^<]*<svg[^>]*>[\s\S]*Документы и изображения/);
  assert.match(markup, /aria-label="Основная навигация"/);
});

test('header keeps account progress, language, feedback, and profile actions accessible', () => {
  const markup = renderToStaticMarkup(React.createElement(Header, {
    user,
    lang: 'ru',
    onSetLang: () => undefined,
    activeTab: 'ai',
    onSelectTab: () => undefined,
    onOpenProfile: () => undefined,
    authenticated: true,
    onOpenFeedback: () => undefined,
  }));
  assert.match(markup, /ИИ-Тьютор/);
  assert.match(markup, /240/);
  assert.match(markup, /Lv3/);
  assert.match(markup, /Прогресс аккаунта/);
  assert.match(markup, /aria-label="Отправить бета-отзыв"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-label="Открыть профиль"/);
});

test('mobile navigation is bounded to four primary actions and an accessible More control', () => {
  const markup = renderToStaticMarkup(React.createElement(BottomNav, {
    activeTab: 'documents', onSelectTab: () => undefined, lang: 'en',
  }));
  assert.match(markup, /aria-label="Mobile navigation"/);
  assert.match(markup, /Dashboard/);
  assert.match(markup, /AI Tutor/);
  assert.match(markup, /Projects/);
  assert.match(markup, /Messages/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, />More</);
  assert.doesNotMatch(markup, /overflow-x-auto/);
});

test('shared primitives expose semantic disabled, progress, loading, error, status, and context states', () => {
  const markup = renderToStaticMarkup(React.createElement('div', null,
    React.createElement(Button, { disabled: true }, 'Save'),
    React.createElement(ProgressBar, { value: 42, label: 'Level progress' }),
    React.createElement(LoadingState, { label: 'Loading files' }),
    React.createElement(ErrorState, { title: 'Could not delete', description: 'Try again.' }),
    React.createElement(StatusBadge, { status: 'ready', children: 'Ready' }),
    React.createElement(ContextChip, { kind: 'document', label: 'beam-spec.md', onRemove: () => undefined, removeLabel: 'Remove beam-spec.md' }),
    React.createElement(ContextChip, { kind: 'image', label: 'beam-diagram.png' }),
  ));
  assert.match(markup, /disabled=""/);
  assert.match(markup, /role="progressbar"/);
  assert.match(markup, /aria-valuenow="42"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /Remove beam-spec.md/);
  assert.match(markup, /beam-diagram.png/);
});

test('global styles define the Phase I tokens without masking structural horizontal overflow', () => {
  const css = readFileSync(path.resolve('src/index.css'), 'utf8');
  for (const token of ['--color-bg', '--color-primary', '--color-ai', '--color-reward', '--color-success', '--color-danger', '--sidebar-width']) {
    assert.match(css, new RegExp(token));
  }
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x\s*:\s*hidden/s);
  assert.match(css, /@media \(min-width: 48rem\) and \(max-width: 63\.999rem\)/);
  assert.match(css, /\.eq-header__actions\s*\{\s*flex:\s*0 0 auto;/s);
  assert.match(css, /\.eq-profile-button__name\s*\{\s*display:\s*none;/s);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
});
