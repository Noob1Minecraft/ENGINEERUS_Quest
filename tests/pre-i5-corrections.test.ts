import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { BOOKS } from '../src/data';

function source(file: string): string {
  return readFileSync(path.resolve(file), 'utf8');
}

test('learning resources use safe external destinations and explicit external-link protection', () => {
  assert.equal(BOOKS.length, 7);
  for (const book of BOOKS) {
    const url = new URL(book.sourceUrl);
    assert.equal(url.protocol, 'https:', book.id);
    assert.ok(['books.google.com', 'darynbaspa.kz', 'modernrobotics.northwestern.edu'].includes(url.hostname), book.id);
  }
  const learning = source('src/components/RoadmapBooksTab.tsx');
  assert.match(learning, /href=\{book\.sourceUrl\}/u);
  assert.match(learning, /target="_blank"/u);
  assert.match(learning, /rel="noopener noreferrer"/u);
  assert.match(learning, /Открыть источник/u);
  assert.match(learning, /Дереккөзді ашу/u);
  assert.match(learning, /View source/u);
  assert.doesNotMatch(learning, /dangerouslySetInnerHTML|javascript:|data:/iu);
});

test('Messages omits only the duplicated legacy progress strip and preserves I4 direct-chat management boundaries', () => {
  const app = source('src/App.tsx');
  const directChat = source('src/components/DirectChatTab.tsx');
  const migration = source('supabase/migrations/20260824084316_direct_chat_foundation.sql');
  assert.match(app, /activeTab !== 'messages'/u);
  assert.match(directChat, /Start conversation|Начать диалог|Сөйлесуді бастау/u);
  assert.match(directChat, /acceptedCandidates/u);
  assert.match(migration, /unique \(user_low_id, user_high_id\)/u);
  assert.doesNotMatch(migration, /(?:alias|archived_at|hidden_at)/iu);
});

test('project owner edit and future-safe archive remain the supported management model', () => {
  const projects = source('src/components/ProjectsTab.tsx');
  const migration = source('supabase/migrations/20260824030618_projects_foundation.sql');
  assert.match(projects, /updateProject/u);
  assert.match(projects, /archiveProject/u);
  assert.match(projects, /'owner_id' in selected/u);
  assert.match(migration, /No DELETE grant or policy is provided/u);
  assert.match(migration, /future-safe archive transition/u);
});
