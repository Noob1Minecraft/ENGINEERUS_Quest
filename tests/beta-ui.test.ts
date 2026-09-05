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
  assert.match(markup, /Закрытая бета/);
  assert.match(markup, /aria-label="Знакомство с закрытой бетой"/);
});

test('onboarding labels switch between Russian, Kazakh, and English', () => {
  const render = (lang: 'ru' | 'kk' | 'en') => renderToStaticMarkup(React.createElement(BetaOnboardingCard, { lang, completing: false, onNavigate: () => undefined, onComplete: () => undefined }));
  assert.match(render('ru'), /Закрытая бета/);
  assert.match(render('kk'), /Жабық бета/);
  assert.match(render('en'), /Controlled beta/);
});

test('feedback UI warns against sensitive data and exposes bounded fields', () => {
  const markup = renderToStaticMarkup(React.createElement(BetaFeedbackModal, { open: true, lang: 'en', productArea: 'projects', onClose: () => undefined }));
  assert.match(markup, /Do not include passwords, tokens, or private messages/);
  assert.match(markup, /maxLength="2000"/);
  assert.match(markup, /beta coordinator/);
  assert.match(markup, /Product area/);
  assert.match(markup, /Projects/);
});

test('feedback categories, product areas, and close labels are localized', () => {
  const render = (lang: 'ru' | 'kk' | 'en') => renderToStaticMarkup(React.createElement(BetaFeedbackModal, { open: true, lang, productArea: 'authentication', onClose: () => undefined }));
  const russian = render('ru');
  const kazakh = render('kk');
  const english = render('en');
  assert.match(russian, /Непонятный интерфейс/);
  assert.match(russian, /Вход и регистрация/);
  assert.match(russian, /aria-label="Закрыть форму отзыва"/);
  assert.match(kazakh, /Түсініксіз интерфейс/);
  assert.match(kazakh, /Кіру және тіркелу/);
  assert.match(kazakh, /aria-label="Пікір терезесін жабу"/);
  assert.match(english, /Confusing UX/);
  assert.match(english, /Authentication/);
});

test('auth accessibility labels and feedback touch targets remain localized and usable', () => {
  const authSource = readFileSync(path.resolve('src/components/AuthModal.tsx'), 'utf8');
  const onboardingSource = readFileSync(path.resolve('src/components/OnboardingModal.tsx'), 'utf8');
  const css = readFileSync(path.resolve('src/index.css'), 'utf8');
  assert.match(authSource, /Закрыть окно аккаунта/);
  assert.match(authSource, /Аккаунт терезесін жабу/);
  assert.match(authSource, /Закрыть окно входа/);
  assert.match(onboardingSource, /Закрыть окно знакомства/);
  assert.match(onboardingSource, /Танысу терезесін жабу/);
  assert.match(css, /\.eq-beta-note button \{[^}]*min-height: 2rem/su);
  assert.match(css, /\.eq-footer__credits button \{[^}]*min-height: 2rem/su);
});

test('App persists account onboarding and does not use the legacy global seen flag', () => {
  const source = readFileSync(path.resolve('src/App.tsx'), 'utf8');
  assert.match(source, /loadBetaState/);
  assert.match(source, /completeBetaOnboarding/);
  assert.match(source, /!betaParticipant\.onboarding_completed_at/);
  assert.match(source, /betaParticipantStatus === 'error'/);
  assert.match(source, /betaParticipantStatus === 'loading'/);
  assert.match(source, /loadBetaParticipant/);
  assert.match(source, /Повторить/);
  assert.match(source, /setBetaParticipantStatus\('error'\)/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /hasSeenOnboarding/);
  assert.doesNotMatch(source, /OnboardingModal/);
});
