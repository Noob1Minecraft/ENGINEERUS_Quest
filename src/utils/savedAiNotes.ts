import type { SavedNote } from '../types';

const SAVED_NOTES_KEY_PREFIX = 'eq_saved_ai_notes:';
export const SAVED_NOTES_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const SAVED_NOTES_MAX_COUNT = 50;

type SavedNotesPayload = {
  version: 1;
  updatedAt: string;
  expiresAt: string;
  notes: SavedNote[];
};

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

function persistPayload(storage: Storage, accountId: string, notes: SavedNote[], now: number): void {
  const payload: SavedNotesPayload = {
    version: 1,
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SAVED_NOTES_RETENTION_MS).toISOString(),
    notes: notes.slice(0, SAVED_NOTES_MAX_COUNT),
  };
  storage.setItem(savedAiNotesKey(accountId), JSON.stringify(payload));
}

export function loadSavedAiNotes(
  storage: Storage,
  accountId: string | null,
  now = Date.now(),
): SavedNote[] {
  if (!accountId) return [];
  try {
    const key = savedAiNotesKey(accountId);
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isSavedNote)) {
      const notes = parsed.slice(0, SAVED_NOTES_MAX_COUNT);
      persistPayload(storage, accountId, notes, now);
      return notes;
    }
    if (!parsed || typeof parsed !== 'object') return [];
    const payload = parsed as Partial<SavedNotesPayload>;
    if (payload.version !== 1 || !Array.isArray(payload.notes) || !payload.notes.every(isSavedNote)) return [];
    const expiresAt = Date.parse(payload.expiresAt ?? '');
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      storage.removeItem(key);
      return [];
    }
    return payload.notes.slice(0, SAVED_NOTES_MAX_COUNT);
  } catch {
    return [];
  }
}

export function storeSavedAiNotes(
  storage: Storage,
  accountId: string | null,
  notes: SavedNote[],
  now = Date.now(),
): void {
  if (!accountId) return;
  try {
    persistPayload(storage, accountId, notes, now);
  } catch {
    // Keep the active in-memory notes usable if browser storage is unavailable.
  }
}

export function clearSavedAiNotes(storage: Storage, accountId: string | null): void {
  if (!accountId) return;
  try {
    storage.removeItem(savedAiNotesKey(accountId));
  } catch {
    // Keep the active in-memory clear action usable if browser storage is unavailable.
  }
}
