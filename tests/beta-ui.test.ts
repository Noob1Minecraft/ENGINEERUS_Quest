import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BetaOnboardingCard } from '../src/components/BetaOnboardingCard';
import { BetaFeedbackModal } from '../src/components/BetaFeedbackModal';
import { Header } from '../src/components/Header';

const user = { id: 'u', username: 'Beta_User', xp: 0, level: 1, streak: 1, completed_quests: [], achievements: [], requests_count: 0, material_count: 0, patent_count: 0, modules_used: [], preferred_lang: 'ru' as const };

test('controlled beta indicator and authenticated feedback entry point render', () => {
  const markup = renderToStaticMarkup(React.createElement(Header, { user, lang: 'en', onSetLang: () => undefined, activeTab: 'home', onSelectTab: () => undefined, onOpenProfile: () => undefined, authenticated: true, onOpenFeedback: () => undefined }));
  assert.match(markup, /Beta/);
  assert.match(markup, /Send beta feedback/);
});

test('first-run onboarding is a small actionable checklist', () => {
  const markup = renderToStaticMarkup(React.createElement(BetaOnboardingCard, { lang: 'ru', completing: false, onNavigate: () => undefined, onComplete: () => undefined }));
  assert.match(markup, /Начните бета-тестирование/);
  assert.match(markup, /Заполните профиль/);
  assert.match(markup, /ИИ-Тьютору/);
  assert.match(markup, /Квесты развивают XP/);
  assert.match(markup, /Projects и EngiMatch/);
});

test('feedback UI warns against sensitive data and exposes bounded fields', () => {
  const markup = renderToStaticMarkup(React.createElement(BetaFeedbackModal, { open: true, lang: 'en', productArea: 'projects', onClose: () => undefined }));
  assert.match(markup, /Do not include passwords, tokens, or private messages/);
  assert.match(markup, /maxLength="2000"/);
  assert.match(markup, /beta coordinator/);
});

test('App persists account onboarding and does not use the legacy global seen flag', () => {
  const source = readFileSync(path.resolve('src/App.tsx'), 'utf8');
  assert.match(source, /loadBetaState/);
  assert.match(source, /completeBetaOnboarding/);
  assert.match(source, /!betaParticipant\.onboarding_completed_at/);
  assert.doesNotMatch(source, /hasSeenOnboarding/);
  assert.doesNotMatch(source, /OnboardingModal/);
});
