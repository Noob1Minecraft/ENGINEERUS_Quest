import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.TEST_SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(url)) {
  throw new Error("Gamification integration tests require the local loopback Supabase stack.");
}

async function createIdentity(admin: SupabaseClient) {
  const email = `gamification-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9a!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Local user was not created.");
  const client = createClient(url!, publishableKey!, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Local user did not sign in.");
  return { id: created.data.user.id, client };
}

test("concurrent authoritative refresh pays a daily reward once and exposes no client mutation RPC", async () => {
  const admin = createClient(url!, secretKey!, { auth: { persistSession: false } });
  const identity = await createIdentity(admin);
  try {
    const activity = await identity.client.rpc("record_daily_activity");
    if (activity.error) throw activity.error;

    const calls = await Promise.all(Array.from({ length: 12 }, () => admin.rpc("refresh_gamification", {
      p_user_id: identity.id,
    })));
    for (const call of calls) {
      if (call.error) throw call.error;
      const state = call.data as { progression: { total_xp: number; level: number }; streak: { current: number } };
      assert.equal(state.streak.current, 1);
      assert.equal(state.progression.total_xp, 5);
      assert.equal(state.progression.level, 1);
    }

    const retry = await admin.rpc("refresh_gamification", { p_user_id: identity.id });
    if (retry.error) throw retry.error;
    const retryState = retry.data as { progression: { total_xp: number; level: number }; streak: { current: number } };
    assert.deepEqual(
      { total_xp: retryState.progression.total_xp, level: retryState.progression.level, streak_days: retryState.streak.current },
      { total_xp: 5, level: 1, streak_days: 1 },
    );

    const forbiddenRefresh = await identity.client.rpc("refresh_gamification", { p_user_id: identity.id });
    assert.ok(forbiddenRefresh.error, "authenticated browser role must not execute the service-only refresh");
    const forgedSkill = await identity.client.from("user_skill_progress").insert({
      user_id: identity.id,
      skill_id: "20000000-0000-4000-8000-000000000001",
      source_key: "forged",
      xp_amount: 100,
    });
    assert.ok(forgedSkill.error, "authenticated browser role must not grant skill XP");
  } finally {
    await admin.auth.admin.deleteUser(identity.id);
  }
});
