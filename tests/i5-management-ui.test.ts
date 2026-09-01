import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getProfileCompletionSteps } from '../src/profile/profileApi';
import { validateDocumentSelection } from '../src/documents/documentApi';
import { validateImageSelection } from '../src/images/imageApi';
import { LibraryDeleteDialog } from '../src/components/LibraryDeleteDialog';
import type { PublicProfile } from '../src/types';

const profile: PublicProfile = {
  id: '70000000-0000-4000-8000-000000000001', username: 'engineer', display_name: null,
  avatar_url: null, university_name: null, primary_discipline: null, bio: null, portfolio_url: null,
  available_for_projects: false, skills: [], tools: [], interests: [], languages: [],
};

const documentsSource = readFileSync(new URL('../src/components/DocumentsTab.tsx', import.meta.url), 'utf8');
const imagesSource = readFileSync(new URL('../src/components/ImagesPanel.tsx', import.meta.url), 'utf8');
const profileSource = readFileSync(new URL('../src/components/ProfileTab.tsx', import.meta.url), 'utf8');
const pickerSource = readFileSync(new URL('../src/components/AiAttachmentPicker.tsx', import.meta.url), 'utf8');

test('Profile completion is a deterministic checklist backed only by existing fields', () => {
  const incomplete = getProfileCompletionSteps(profile, 'en');
  assert.equal(incomplete.length, 5);
  assert.equal(incomplete.every(({ complete }) => !complete), true);
  const complete = getProfileCompletionSteps({ ...profile, display_name: 'Dana', university_name: 'KBTU', primary_discipline: { id: '1', slug: 'mechanical', label_ru: 'Механика', label_kk: 'Механика', label_en: 'Mechanical' }, bio: 'Mechanical engineering student', skills: [{ id: '2', slug: 'cad', label_ru: 'САПР', label_kk: 'АЖЖ', label_en: 'CAD', proficiency: null }] }, 'ru');
  assert.equal(complete.every(({ complete: done }) => done), true);
  assert.doesNotMatch(profileSource, /profileCompletionPercent|completionPercentage/u);
});

test('Profile edit uses existing limits, localized visibility, and protects unsaved changes', () => {
  assert.match(profileSource, /maxLength=\{50\}/u);
  assert.match(profileSource, /maxLength=\{100\}/u);
  assert.match(profileSource, /maxLength=\{2000\}/u);
  assert.match(profileSource, /beforeunload/u);
  assert.match(profileSource, /profileToForm\(profile\)/u);
  assert.match(profileSource, /Эти данные помогают EngiMatch|Бұл деректер EngiMatch|This information helps EngiMatch/u);
  assert.doesNotMatch(profileSource, />Authenticated<|>Private<|>Public</u);
});

test('Document upload selection rejects unsupported and oversized files before upload', () => {
  assert.match(validateDocumentSelection({ name: 'notes.exe', size: 10 }, 'en') ?? '', /PDF/u);
  assert.match(validateDocumentSelection({ name: 'beam.pdf', size: 10 * 1024 * 1024 + 1 }, 'ru') ?? '', /10 МБ/u);
  assert.equal(validateDocumentSelection({ name: 'beam.MD', size: 1024 }, 'en'), null);
});

test('Image upload selection accepts only supported bounded private image formats', () => {
  assert.match(validateImageSelection({ type: 'image/gif', size: 10 }, 'en') ?? '', /JPEG/u);
  assert.match(validateImageSelection({ type: 'image/png', size: 8 * 1024 * 1024 + 1 }, 'kk') ?? '', /8 МиБ/u);
  assert.equal(validateImageSelection({ type: 'image/webp', size: 1024 }, 'ru'), null);
});

test('Private library management has localized lifecycle states and no internal path exposure', () => {
  for (const source of [documentsSource, imagesSource]) {
    assert.match(source, /role="status"/u);
    assert.match(source, /role="alert"/u);
    assert.match(source, /LibraryDeleteDialog/u);
    assert.match(source, /RefreshCw/u);
    assert.doesNotMatch(source, /storage_path|bucket_path|publicUrl|signedUrl/u);
  }
  assert.match(documentsSource, /Готов|Дайын|Ready/u);
  assert.match(imagesSource, /Обработка|Өңделуде|Processing/u);
});

test('Destructive confirmation is a labeled modal with Escape and focus restoration', () => {
  const markup = renderToStaticMarkup(React.createElement(LibraryDeleteDialog, {
    open: true, title: 'Delete?', description: 'Private file removal', cancelLabel: 'Cancel',
    confirmLabel: 'Delete', deletingLabel: 'Deleting', deleting: false, onCancel: () => undefined, onConfirm: () => undefined,
  }));
  assert.match(markup, /role="dialog"/u);
  assert.match(markup, /aria-modal="true"/u);
  const source = readFileSync(new URL('../src/components/LibraryDeleteDialog.tsx', import.meta.url), 'utf8');
  assert.match(source, /event\.key === 'Escape'/u);
  assert.match(source, /previousFocus\.current\?\.focus/u);
});

test('Tutor picker remains one owner-library model with ready-only selection and three-image cap', () => {
  assert.match(pickerSource, /listDocuments\(\)/u);
  assert.match(pickerSource, /listImages\(\)/u);
  assert.match(pickerSource, /filter\(\(item\) => item\.status === 'ready'\)/u);
  assert.match(pickerSource, /images\.length >= 3/u);
  assert.match(pickerSource, /aria-pressed=\{selected\}/u);
  assert.doesNotMatch(pickerSource, /storage_path|publicUrl|signedUrl/u);
});

test('Long filenames and mobile controls are constrained without global overflow hiding', () => {
  assert.match(documentsSource, /overflow-wrap:anywhere/u);
  assert.match(imagesSource, /overflow-wrap:anywhere/u);
  assert.match(pickerSource, /truncate/u);
  assert.doesNotMatch(`${documentsSource}\n${imagesSource}`, /overflow-x-hidden/u);
});
