import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { Session } from '@supabase/supabase-js';
import {
  buildPasswordRecoveryRedirect,
  canSubmitRecoveryRequest,
  hasPasswordRecoveryCallbackError,
  hasPasswordRecoveryIntent,
  isValidRecoveryEmail,
  MIN_RECOVERY_PASSWORD_LENGTH,
  removeAuthCallbackArtifacts,
  requestPasswordRecovery,
  resolvePasswordRecoveryStatus,
  updateRecoveredPassword,
  validateRecoveryPassword,
} from '../src/auth/passwordRecovery';

const session = { user: { id: '11111111-1111-4111-8111-111111111111' } } as Session;
const location = (href: string) => {
  const url = new URL(href);
  return { origin: url.origin, href: url.href, search: url.search, hash: url.hash };
};

test('recovery request uses only the current secure origin and normalizes email', async () => {
  const calls: Array<{ email: string; redirectTo: string }> = [];
  await requestPasswordRecovery({ auth: { async resetPasswordForEmail(email, options) {
    calls.push({ email, redirectTo: options.redirectTo });
    return { error: null };
  } } }, '  student@example.com ', 'https://equest.kz');
  assert.deepEqual(calls, [{ email: 'student@example.com', redirectTo: 'https://equest.kz' }]);
});

test('malformed email is rejected before Supabase is called', async () => {
  let calls = 0;
  await assert.rejects(requestPasswordRecovery({ auth: { async resetPasswordForEmail() {
    calls += 1;
    return { error: null };
  } } }, 'not-an-email', 'https://equest.kz'));
  assert.equal(calls, 0);
  assert.equal(isValidRecoveryEmail('person@example.com'), true);
  assert.equal(isValidRecoveryEmail('person @example.com'), false);
});

test('request errors remain internal and are available for localized generic UI handling', async () => {
  const providerError = new Error('private provider detail');
  await assert.rejects(requestPasswordRecovery({ auth: { async resetPasswordForEmail() {
    return { error: providerError };
  } } }, 'student@example.com', 'https://equest.kz'), providerError);
});

test('redirect construction rejects insecure or credential-bearing origins and accepts local development', () => {
  assert.equal(buildPasswordRecoveryRedirect('https://equest.kz'), 'https://equest.kz');
  assert.equal(buildPasswordRecoveryRedirect('http://localhost:5173'), 'http://localhost:5173');
  assert.throws(() => buildPasswordRecoveryRedirect('http://attacker.example'));
  assert.throws(() => buildPasswordRecoveryRedirect('https://user:password@equest.kz'));
  assert.equal(buildPasswordRecoveryRedirect('https://equest.kz/?next=https://attacker.example'), 'https://equest.kz');
});

test('recovery intent and expired callback detection ignore unrelated OAuth errors', () => {
  assert.equal(hasPasswordRecoveryIntent(location('https://equest.kz/#type=recovery')), true);
  assert.equal(hasPasswordRecoveryCallbackError(location('https://equest.kz/?error_code=otp_expired')), true);
  assert.equal(hasPasswordRecoveryCallbackError(location('https://equest.kz/?error_code=access_denied')), false);
});

test('PASSWORD_RECOVERY and refresh restoration resolve without redirect loops', () => {
  assert.equal(resolvePasswordRecoveryStatus({ event: 'PASSWORD_RECOVERY', session, intentPresent: false, callbackErrorPresent: false, markerPresent: false }), 'ready');
  assert.equal(resolvePasswordRecoveryStatus({ event: 'INITIAL_SESSION', session, intentPresent: false, callbackErrorPresent: false, markerPresent: true }), 'ready');
  assert.equal(resolvePasswordRecoveryStatus({ event: 'INITIAL_SESSION', session: null, intentPresent: true, callbackErrorPresent: true, markerPresent: false }), 'invalid');
  assert.equal(resolvePasswordRecoveryStatus({ event: 'INITIAL_SESSION', session: null, intentPresent: false, callbackErrorPresent: false, markerPresent: false }), 'idle');
});

test('callback cleanup removes auth artifacts without following return destinations', () => {
  let replaced = '';
  removeAuthCallbackArtifacts(
    location('https://equest.kz/?error_code=otp_expired&next=https://attacker.example#type=recovery&access_token=secret'),
    { replaceState(_data, _unused, url) { replaced = String(url); } },
  );
  assert.equal(replaced, '/');
});

test('password validation enforces the recovery minimum and exact confirmation', () => {
  assert.equal(MIN_RECOVERY_PASSWORD_LENGTH, 8);
  assert.equal(validateRecoveryPassword('short', 'short'), 'too_short');
  assert.equal(validateRecoveryPassword('long-enough', 'different'), 'mismatch');
  assert.equal(validateRecoveryPassword('long-enough', 'long-enough'), null);
});

test('successful password completion sends only the password to Supabase updateUser', async () => {
  const updates: Array<{ password: string }> = [];
  await updateRecoveredPassword({ auth: { async updateUser(attributes) {
    updates.push(attributes);
    return { error: null };
  } } }, 'new-secure-password');
  assert.deepEqual(updates, [{ password: 'new-secure-password' }]);
});

test('UI and Supabase rate limits prevent rapid repeated recovery requests', () => {
  assert.equal(canSubmitRecoveryRequest(1_000, 60_999), false);
  assert.equal(canSubmitRecoveryRequest(1_000, 61_000), true);
});

test('recovery UI is localized, accessible, and never renders raw provider errors', () => {
  const source = readFileSync(path.resolve('src/components/AuthModal.tsx'), 'utf8');
  assert.match(source, /Забыли пароль\?/);
  assert.match(source, /Құпия сөзді ұмыттыңыз ба\?/);
  assert.match(source, /Forgot password\?/);
  assert.match(source, /Если аккаунт с таким адресом существует/);
  assert.match(source, /Егер мұндай мекенжайы бар аккаунт болса/);
  assert.match(source, /If an account exists for that address/);
  assert.match(source, /autoComplete="email"/);
  assert.match(source, /autoComplete="new-password"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /newPasswordInputRef\.current\?\.focus\(\)/);
  assert.match(source, /confirmPasswordInputRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(source, /error\.message|errorMsg\s*=\s*error/);
});

test('AuthContext centralizes request, recovery event, password update, and secure cancellation', () => {
  const source = readFileSync(path.resolve('src/auth/AuthContext.tsx'), 'utf8');
  const recoverySource = readFileSync(path.resolve('src/auth/passwordRecovery.ts'), 'utf8');
  assert.match(recoverySource, /event === 'PASSWORD_RECOVERY'/);
  assert.match(source, /requestPasswordRecovery\(client, email, window\.location\.origin\)/);
  assert.match(source, /updateRecoveredPassword\(client, password\)/);
  assert.match(source, /passwordRecoveryStatus === 'ready'/);
  assert.match(source, /signOutAuthSession/);
  assert.doesNotMatch(source, /service_role|SUPABASE_SECRET_KEY/);
});
