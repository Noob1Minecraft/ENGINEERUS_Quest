import assert from 'node:assert/strict';
import test from 'node:test';
import type { SavedNote } from '../src/types';
import {
  SAVED_NOTES_MAX_COUNT,
  SAVED_NOTES_RETENTION_MS,
  clearSavedAiNotes,
  loadSavedAiNotes,
  savedAiNotesKey,
  storeSavedAiNotes,
} from '../src/utils/savedAiNotes';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const note = (id: string): SavedNote => ({
  id, module: 'tutor', query: `question-${id}`, response: `answer-${id}`, savedAt: '2026-08-26',
});

test('saved AI notes are isolated by authenticated account and restored on account switch', () => {
  const storage = new MemoryStorage();
  storeSavedAiNotes(storage, 'account-a', [note('a')]);
  storeSavedAiNotes(storage, 'account-b', [note('b')]);

  assert.deepEqual(loadSavedAiNotes(storage, 'account-a'), [note('a')]);
  assert.deepEqual(loadSavedAiNotes(storage, 'account-b'), [note('b')]);
  assert.deepEqual(loadSavedAiNotes(storage, 'account-a'), [note('a')]);
  assert.notEqual(savedAiNotesKey('account-a'), savedAiNotesKey('account-b'));
});

test('logout clears the active view without deleting another account namespace', () => {
  const storage = new MemoryStorage();
  storeSavedAiNotes(storage, 'account-a', [note('a')]);

  assert.deepEqual(loadSavedAiNotes(storage, null), []);
  assert.deepEqual(loadSavedAiNotes(storage, 'account-a'), [note('a')]);
});

test('ambiguous legacy notes are ignored and corrupt scoped storage fails closed', () => {
  const storage = new MemoryStorage();
  storage.setItem('eq_saved_ai_notes', JSON.stringify([note('legacy')]));
  storage.setItem(savedAiNotesKey('account-a'), '{not-json');
  storage.setItem(savedAiNotesKey('account-b'), JSON.stringify([{ id: 'partial' }]));

  assert.deepEqual(loadSavedAiNotes(storage, 'account-a'), []);
  assert.deepEqual(loadSavedAiNotes(storage, 'account-b'), []);
  assert.deepEqual(loadSavedAiNotes(storage, 'account-c'), []);
  assert.ok(storage.getItem('eq_saved_ai_notes'));
});

test('a browser storage write failure does not expose or throw note content', () => {
  const storage = new MemoryStorage();
  storage.setItem = () => { throw new Error('quota unavailable'); };
  assert.doesNotThrow(() => storeSavedAiNotes(storage, 'account-a', [note('private')]));
});

test('legacy scoped notes migrate to bounded expiring storage without losing content', () => {
  const storage = new MemoryStorage();
  const now = Date.parse('2026-09-20T00:00:00.000Z');
  storage.setItem(savedAiNotesKey('account-a'), JSON.stringify([note('legacy')]));

  assert.deepEqual(loadSavedAiNotes(storage, 'account-a', now), [note('legacy')]);
  const payload = JSON.parse(storage.getItem(savedAiNotesKey('account-a')) ?? '{}') as {
    version: number; expiresAt: string; notes: SavedNote[];
  };
  assert.equal(payload.version, 1);
  assert.equal(Date.parse(payload.expiresAt), now + SAVED_NOTES_RETENTION_MS);
  assert.deepEqual(payload.notes, [note('legacy')]);
});

test('saved AI notes expire after the retention window and are removed from storage', () => {
  const storage = new MemoryStorage();
  const now = Date.parse('2026-09-20T00:00:00.000Z');
  storeSavedAiNotes(storage, 'account-a', [note('a')], now);

  assert.deepEqual(loadSavedAiNotes(storage, 'account-a', now + SAVED_NOTES_RETENTION_MS - 1), [note('a')]);
  assert.deepEqual(loadSavedAiNotes(storage, 'account-a', now + SAVED_NOTES_RETENTION_MS), []);
  assert.equal(storage.getItem(savedAiNotesKey('account-a')), null);
});

test('saved AI notes are capped and can be explicitly cleared per account', () => {
  const storage = new MemoryStorage();
  const notes = Array.from({ length: SAVED_NOTES_MAX_COUNT + 5 }, (_, index) => note(String(index)));
  storeSavedAiNotes(storage, 'account-a', notes);
  storeSavedAiNotes(storage, 'account-b', [note('b')]);

  assert.equal(loadSavedAiNotes(storage, 'account-a').length, SAVED_NOTES_MAX_COUNT);
  clearSavedAiNotes(storage, 'account-a');
  assert.deepEqual(loadSavedAiNotes(storage, 'account-a'), []);
  assert.deepEqual(loadSavedAiNotes(storage, 'account-b'), [note('b')]);
});
