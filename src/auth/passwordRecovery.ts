import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export const MIN_RECOVERY_PASSWORD_LENGTH = 8;
export const RECOVERY_REQUEST_COOLDOWN_MS = 60_000;

const RECOVERY_STORAGE_KEY = 'engineerus.password-recovery-active';
const AUTH_RESPONSE_KEYS = [
  'access_token',
  'code',
  'error',
  'error_code',
  'error_description',
  'expires_at',
  'expires_in',
  'refresh_token',
  'redirect',
  'redirectTo',
  'returnTo',
  'next',
  'token_type',
  'type',
] as const;

export type PasswordRecoveryStatus = 'idle' | 'verifying' | 'ready' | 'invalid' | 'updated';
export type PasswordValidationError = 'too_short' | 'mismatch' | null;

type BrowserLocation = Pick<Location, 'origin' | 'href' | 'hash' | 'search'>;
type BrowserHistory = Pick<History, 'replaceState'>;
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type RecoveryRequestClient = {
  auth: {
    resetPasswordForEmail: (
      email: string,
      options: { redirectTo: string },
    ) => Promise<{ error: Error | null }>;
  };
};

type PasswordUpdateClient = {
  auth: {
    updateUser: (attributes: { password: string }) => Promise<{ error: Error | null }>;
  };
};

export function buildPasswordRecoveryRedirect(origin: string): string {
  const url = new URL(origin);
  const isLocalDevelopment = url.protocol === 'http:'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

  if (url.username || url.password || (url.protocol !== 'https:' && !isLocalDevelopment)) {
    throw new Error('Password recovery requires the current secure application origin.');
  }

  // No query-provided next/returnTo value is accepted. Supabase also enforces its
  // configured redirect allow-list before sending the recovery email.
  return url.origin;
}

function readParams(value: string): URLSearchParams {
  return new URLSearchParams(value.startsWith('#') || value.startsWith('?') ? value.slice(1) : value);
}

export function hasPasswordRecoveryIntent(location: BrowserLocation): boolean {
  const search = readParams(location.search);
  const hash = readParams(location.hash);
  return search.get('type') === 'recovery' || hash.get('type') === 'recovery';
}

export function hasPasswordRecoveryCallbackError(location: BrowserLocation): boolean {
  const search = readParams(location.search);
  const hash = readParams(location.hash);
  const code = search.get('error_code') || hash.get('error_code');
  return code === 'otp_expired'
    || code === 'otp_disabled'
    || code === 'bad_jwt'
    || code === 'flow_state_not_found'
    || code === 'flow_state_expired';
}

export function readPasswordRecoveryMarker(storage: BrowserStorage): boolean {
  try {
    return storage.getItem(RECOVERY_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writePasswordRecoveryMarker(storage: BrowserStorage, active: boolean): void {
  try {
    if (active) storage.setItem(RECOVERY_STORAGE_KEY, '1');
    else storage.removeItem(RECOVERY_STORAGE_KEY);
  } catch {
    // Recovery remains functional even when browser storage is unavailable.
  }
}

export function removeAuthCallbackArtifacts(
  location: BrowserLocation,
  history: BrowserHistory,
): void {
  const url = new URL(location.href);
  for (const key of AUTH_RESPONSE_KEYS) {
    url.searchParams.delete(key);
  }

  const hash = readParams(url.hash);
  for (const key of AUTH_RESPONSE_KEYS) {
    hash.delete(key);
  }
  url.hash = hash.size > 0 ? hash.toString() : '';
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export function resolvePasswordRecoveryStatus(options: {
  event: AuthChangeEvent | null;
  session: Session | null;
  intentPresent: boolean;
  callbackErrorPresent: boolean;
  markerPresent: boolean;
}): PasswordRecoveryStatus {
  if (options.event === 'PASSWORD_RECOVERY' && options.session) return 'ready';
  if (options.callbackErrorPresent && (options.intentPresent || options.markerPresent)) return 'invalid';
  if ((options.intentPresent || options.markerPresent) && options.session) return 'ready';
  if (options.intentPresent || options.markerPresent) return 'invalid';
  return 'idle';
}

export function validateRecoveryPassword(
  password: string,
  confirmation: string,
): PasswordValidationError {
  if (password.length < MIN_RECOVERY_PASSWORD_LENGTH) return 'too_short';
  if (password !== confirmation) return 'mismatch';
  return null;
}

export function canSubmitRecoveryRequest(lastAttemptAt: number, now = Date.now()): boolean {
  return lastAttemptAt === 0 || now - lastAttemptAt >= RECOVERY_REQUEST_COOLDOWN_MS;
}

export function isValidRecoveryEmail(email: string): boolean {
  const normalized = email.trim();
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export async function requestPasswordRecovery(
  client: RecoveryRequestClient,
  email: string,
  currentOrigin: string,
): Promise<void> {
  if (!isValidRecoveryEmail(email)) throw new Error('Invalid recovery email.');
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: buildPasswordRecoveryRedirect(currentOrigin),
  });
  if (error) throw error;
}

export async function updateRecoveredPassword(
  client: PasswordUpdateClient,
  password: string,
): Promise<void> {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}
