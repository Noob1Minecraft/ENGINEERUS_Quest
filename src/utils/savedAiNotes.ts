import type { SavedNote } from '../types';

const SAVED_NOTES_KEY_PREFIX = 'eq_saved_ai_notes:';

function isSavedNote(value: unknown): value is SavedNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as Record<string, unknown>;
  return typeof note.id === 'string'
    && typeof note.module === 'string'
    && typeof note.query === 'string'
    && typeof note.response === 'string'
    && typeof note.savedAt === 'string';
}

export function savedAiNotesKey(accountId: string): string {
  return `${SAVED_NOTES_KEY_PREFIX}${encodeURIComponent(accountId)}`;
}

export function loadSavedAiNotes(storage: Storage, accountId: string | null): SavedNote[] {
  if (!accountId) return [];
  try {
    const raw = storage.getItem(savedAiNotesKey(accountId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isSavedNote) ? parsed : [];
  } catch {
    return [];
  }
}

export function storeSavedAiNotes(
  storage: Storage,
  accountId: string | null,
  notes: SavedNote[],
): void {
  if (!accountId) return;
  try {
    storage.setItem(savedAiNotesKey(accountId), JSON.stringify(notes));
  } catch {
    // Keep the active in-memory notes usable if browser storage is unavailable.
  }
}
