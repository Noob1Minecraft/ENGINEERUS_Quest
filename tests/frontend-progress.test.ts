import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomNav } from "../src/components/BottomNav";
import { Header } from "../src/components/Header";
import { OnboardingModal } from "../src/components/OnboardingModal";
import { ProfileStats } from "../src/components/ProfileStats";
import type { UserProfile } from "../src/types";

const user: UserProfile = {
  id: "70000000-0000-4000-8000-000000000001",
  username: "engineer",
  xp: 0,
  level: 1,
  streak: 1,
  completed_quests: [],
  achievements: [],
  requests_count: 0,
  material_count: 0,
  patent_count: 0,
  modules_used: [],
  preferred_lang: "ru",
};

test("progress UI renders the authoritative current streak", () => {
  const markup = renderToStaticMarkup(React.createElement(ProfileStats, {
    user,
    lang: "ru",
    onNavigateToQuest: () => undefined,
  }));
  assert.match(markup, /Дней подряд[\s\S]{0,800}>1 <span[^>]*>Дней<\/span>/);
});

test("desktop, mobile, and onboarding UI no longer expose Telegram sync", () => {
  const header = renderToStaticMarkup(React.createElement(Header, {
    user,
    lang: "ru",
    onSetLang: () => undefined,
    activeTab: "home",
    onSelectTab: () => undefined,
    onOpenAuth: () => undefined,
  }));
  const bottomNav = renderToStaticMarkup(React.createElement(BottomNav, {
    activeTab: "home",
    onSelectTab: () => undefined,
    lang: "ru",
  }));
  const onboarding = renderToStaticMarkup(React.createElement(OnboardingModal, {
    isOpen: true,
    onClose: () => undefined,
    lang: "ru",
  }));

  for (const markup of [header, bottomNav, onboarding]) {
    assert.doesNotMatch(markup, /Telegram|синхронизац|синхрондау/i);
  }
});

test("obsolete Telegram sync component and routing wiring are removed", () => {
  const app = readFileSync(path.resolve("src/App.tsx"), "utf8");
  const header = readFileSync(path.resolve("src/components/Header.tsx"), "utf8");
  const bottomNav = readFileSync(path.resolve("src/components/BottomNav.tsx"), "utf8");
  const onboarding = readFileSync(path.resolve("src/components/OnboardingModal.tsx"), "utf8");

  assert.equal(existsSync(path.resolve("src/components/TelegramSyncTab.tsx")), false);
  for (const source of [app, header, bottomNav, onboarding]) {
    assert.doesNotMatch(source, /TelegramSyncTab|activeTab === ['"]sync['"]|setActiveTab\(['"]sync['"]\)|Telegram-бот|Telegram Bot Sync/i);
  }
  assert.match(app, /Прогресс автоматически сохраняется|progressModuleDesc/);
});
