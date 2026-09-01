import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(file: string): string {
  return readFileSync(path.resolve(file), 'utf8');
}

test('six refined surfaces use task-specific semantic workspaces', () => {
  const files = {
    learning: source('src/components/RoadmapBooksTab.tsx'),
    tutor: source('src/components/AIAssistantTab.tsx'),
    documents: source('src/components/DocumentsTab.tsx'),
    images: source('src/components/ImagesPanel.tsx'),
    projects: source('src/components/ProjectsTab.tsx'),
    matching: source('src/components/EngiMatchTab.tsx'),
    ranking: source('src/components/LeaderboardTab.tsx'),
  };

  assert.match(files.learning, /eq-study-workspace/u);
  assert.match(files.tutor, /eq-ai-refined/u);
  assert.match(files.documents, /eq-library-workspace/u);
  assert.match(files.images, /eq-image-library/u);
  assert.match(files.projects, /eq-project-workspace/u);
  assert.match(files.matching, /eq-match-workspace/u);
  assert.match(files.ranking, /eq-ranking-register/u);
});

test('learning and collaboration utility labels remain localized', () => {
  const learning = source('src/components/RoadmapBooksTab.tsx');
  const projects = source('src/components/ProjectsTab.tsx');
  const matching = source('src/components/EngiMatchTab.tsx');

  for (const value of ['УЧЕБНЫЙ МАРШРУТ', 'ОҚУ БАҒЫТЫ', 'LEARNING PATH']) assert.match(learning, new RegExp(value, 'u'));
  for (const component of [projects, matching]) {
    assert.match(component, /signInAction/u);
    assert.match(component, /workshop/u);
  }
});

test('refinement CSS uses separators and restrained task-specific surfaces', () => {
  const css = source('src/index.css');
  for (const selector of ['eq-study-workspace', 'eq-ai-refined', 'eq-library-workspace', 'eq-image-library', 'eq-project-workspace', 'eq-match-workspace', 'eq-ranking-register']) {
    assert.match(css, new RegExp(`\\.${selector}`, 'u'));
  }
  assert.match(css, /eq-ai-saved-note[^}]*border-width:\s*0 0 1px/su);
  assert.match(css, /eq-project-detail[^}]*border-width:\s*1px 0 0/su);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*eq-ranking-register/u);
  assert.doesNotMatch(css, /eq-ai-refined[^}]*glow/iu);
});

test('existing behavior hooks remain present on refined interactive surfaces', () => {
  const tutor = source('src/components/AIAssistantTab.tsx');
  const documents = source('src/components/DocumentsTab.tsx');
  const images = source('src/components/ImagesPanel.tsx');
  const projects = source('src/components/ProjectsTab.tsx');
  const matching = source('src/components/EngiMatchTab.tsx');

  for (const required of ['handleSendPrompt', 'AiAttachmentPicker', 'handleCreateNewChat', 'handleDeleteChat']) assert.match(tutor, new RegExp(required, 'u'));
  for (const required of ['uploadDocument', 'deleteDocument', 'onUseWithTutor']) assert.match(documents, new RegExp(required, 'u'));
  for (const required of ['uploadImage', 'deleteImage', 'aria-pressed={isSelected}']) assert.match(images, new RegExp(required.replace(/[{}]/gu, '\\$&'), 'u'));
  for (const required of ['createProject', 'updateProject', 'archiveProject', 'ProjectRecruitmentPanel']) assert.match(projects, new RegExp(required, 'u'));
  for (const required of ['findTeammates', 'findProjectMatches', 'inviteToProjectRole', 'applyToProjectRole']) assert.match(matching, new RegExp(required, 'u'));
});
