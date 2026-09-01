import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(file: string): string {
  return readFileSync(path.resolve(file), 'utf8');
}

test('major feature surfaces are route-split behind localized suspense feedback', () => {
  const app = source('src/App.tsx');
  assert.match(app, /import React, \{ lazy, Suspense,/u);
  for (const component of ['ProfileStats', 'QuestsTab', 'LeaderboardTab', 'AIAssistantTab', 'RoadmapBooksTab', 'ProfileTab', 'ProjectsTab', 'EngiMatchTab', 'DirectChatTab', 'DocumentsTab']) {
    assert.match(app, new RegExp(`const ${component} = lazy\\(`, 'u'));
    assert.doesNotMatch(app, new RegExp(`import \\{ ${component} \\} from`, 'u'));
  }
  assert.match(app, /<Suspense fallback=\{<LoadingState label=\{featureLoadingLabel\}/u);
});

test('mobile navigation and collaboration dialogs use the shared focus boundary', () => {
  const bottomNav = source('src/components/BottomNav.tsx');
  const directChat = source('src/components/DirectChatTab.tsx');
  const ai = source('src/components/AIAssistantTab.tsx');
  assert.match(bottomNav, /useDialogFocus\(\{ open: moreOpen/u);
  assert.match(bottomNav, /<section ref=\{dialogRef\} role="dialog"/u);
  assert.match(directChat, /useDialogFocus\(\{ open: startOpen/u);
  assert.match(directChat, /<section ref=\{startDialogRef\} role="dialog"/u);
  assert.match(ai, /open: Boolean\(renameTarget \|\| deleteTarget\)/u);
  assert.match(ai, /ref=\{managementDialogRef/u);
  assert.doesNotMatch(bottomNav, /document\.addEventListener\('keydown'/u);
  assert.doesNotMatch(directChat, /document\.addEventListener\('keydown'/u);
});

test('collaboration request failures use localized safe copy instead of backend messages', () => {
  const directChat = source('src/components/DirectChatTab.tsx');
  const engiMatch = source('src/components/EngiMatchTab.tsx');
  const projects = source('src/components/ProjectsTab.tsx');
  const recruitment = source('src/components/ProjectRecruitmentPanel.tsx');
  for (const component of [directChat, engiMatch, projects, recruitment]) {
    assert.doesNotMatch(component, /error instanceof ApiError \? error\.message/u);
  }
  assert.match(directChat, /return TEXT\[lang\]\.error/u);
  assert.match(engiMatch, /Matching could not be refreshed/u);
  assert.match(projects, /The project action could not be completed/u);
  assert.match(recruitment, /Project requests and roles could not be refreshed/u);
});

test('EngiMatch prevents duplicate actions and cancels stale discovery updates', () => {
  const engiMatch = source('src/components/EngiMatchTab.tsx');
  assert.match(engiMatch, /actingRef\.current\.has\(id\)/u);
  assert.match(engiMatch, /actingRef\.current\.add\(id\)/u);
  assert.match(engiMatch, /actingRef\.current\.delete\(id\)/u);
  assert.ok((engiMatch.match(/let active = true/gu) ?? []).length >= 2);
  assert.ok((engiMatch.match(/return \(\) => \{ active = false; \}/gu) ?? []).length >= 2);
});

test('Direct Chat ignores message responses for a no-longer-selected conversation', () => {
  const directChat = source('src/components/DirectChatTab.tsx');
  assert.match(directChat, /if \(selectedRef\.current !== conversationId\) return;/u);
  assert.match(directChat, /if \(markRead\) await markDirectConversationRead/u);
});
