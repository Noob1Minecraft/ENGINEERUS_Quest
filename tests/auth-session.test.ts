import assert from "node:assert/strict";
import test from "node:test";
import type { Session } from "@supabase/supabase-js";
import { restoreAuthSession, signOutAuthSession } from "../src/auth/AuthContext";

const session = {
  access_token: "local-test-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4_000_000_000,
  refresh_token: "local-test-refresh",
  user: { id: "11111111-1111-4111-8111-111111111111" },
} as Session;

test("restores the existing Supabase session and unsubscribes cleanly", async () => {
  let listener: ((event: "SIGNED_IN", session: Session | null) => void) | undefined;
  let unsubscribed = false;
  const snapshots: Array<{ session: Session | null; loading: boolean }> = [];
  const client = {
    auth: {
      async getSession() {
        return { data: { session }, error: null };
      },
      onAuthStateChange(callback: typeof listener) {
        listener = callback;
        return { data: { subscription: { id: "test", callback: () => undefined, unsubscribe: () => { unsubscribed = true; } } } };
      },
    },
  };

  const cleanup = await restoreAuthSession(client as never, (snapshot) => snapshots.push(snapshot));
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].session?.access_token, "local-test-token");
  assert.equal(snapshots[0].loading, false);
  assert.ok(listener);
  cleanup();
  assert.equal(unsubscribed, true);
});

test("successful sign-out calls Supabase once and clears the auth snapshot", async () => {
  let calls = 0;
  let cleared = 0;
  await signOutAuthSession({
    auth: {
      async signOut() {
        calls += 1;
        return { error: null };
      },
    },
  }, () => { cleared += 1; });

  assert.equal(calls, 1);
  assert.equal(cleared, 1);
});

test("failed sign-out preserves auth state and surfaces the error", async () => {
  let calls = 0;
  let cleared = 0;
  const failure = new Error("sign out failed");

  await assert.rejects(signOutAuthSession({
    auth: {
      async signOut() {
        calls += 1;
        return { error: failure };
      },
    },
  }, () => { cleared += 1; }), failure);

  assert.equal(calls, 1);
  assert.equal(cleared, 0);
});
