import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.TEST_SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(url)) {
  throw new Error("Streak integration tests require the local loopback Supabase stack.");
}

type TestIdentity = { id: string; client: SupabaseClient };
type DailyActivity = {
  current_streak: number;
  longest_streak: number;
  last_active_date: string;
};

function almatyDate(daysAgo: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function createIdentity(admin: SupabaseClient, label: string): Promise<TestIdentity> {
  const email = `streak-${label}-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9a!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Local test user was not created.");
  const client = createClient(url!, publishableKey!, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Local test user did not sign in.");
  return { id: created.data.user.id, client };
}

async function record(client: SupabaseClient): Promise<DailyActivity> {
  const result = await client.rpc("record_daily_activity");
  if (result.error) throw result.error;
  const activity = (result.data as DailyActivity[])[0];
  assert.ok(activity);
  return activity;
}

test("daily streak transitions are authoritative, isolated, and concurrency-safe", async () => {
  const admin = createClient(url!, secretKey!, { auth: { persistSession: false } });
  const userA = await createIdentity(admin, "a");
  const userB = await createIdentity(admin, "b");

  try {
    let activity = await record(userA.client);
    assert.equal(activity.current_streak, 1);
    assert.equal(activity.longest_streak, 1);

    activity = await record(userA.client);
    assert.equal(activity.current_streak, 1, "same-day activity must be idempotent");

    let update = await admin.from("user_progress").update({
      streak_days: 1,
      longest_streak: 1,
      last_activity_date: almatyDate(1),
      total_xp: 275,
      level: 3,
      requests_count: 4,
    }).eq("user_id", userA.id);
    if (update.error) throw update.error;
    activity = await record(userA.client);
    assert.equal(activity.current_streak, 2);
    assert.equal((await record(userA.client)).current_streak, 2);

    update = await admin.from("user_progress").update({
      streak_days: 2,
      longest_streak: 2,
      last_activity_date: almatyDate(1),
    }).eq("user_id", userA.id);
    if (update.error) throw update.error;
    assert.equal((await record(userA.client)).current_streak, 3);

    update = await admin.from("user_progress").update({
      streak_days: 3,
      longest_streak: 3,
      last_activity_date: almatyDate(2),
    }).eq("user_id", userA.id);
    if (update.error) throw update.error;
    activity = await record(userA.client);
    assert.equal(activity.current_streak, 1);
    assert.equal(activity.longest_streak, 3);

    update = await admin.from("user_progress").update({
      streak_days: 3,
      longest_streak: 3,
      last_activity_date: almatyDate(1),
    }).eq("user_id", userA.id);
    if (update.error) throw update.error;
    const concurrent = await Promise.all(Array.from({ length: 12 }, () => record(userA.client)));
    assert.ok(concurrent.every(({ current_streak }) => current_streak === 4));
    assert.ok(concurrent.every(({ longest_streak }) => longest_streak === 4));

    assert.equal((await record(userB.client)).current_streak, 1);
    const progressA = await admin.from("user_progress")
      .select("streak_days,longest_streak,total_xp,level,requests_count")
      .eq("user_id", userA.id)
      .single();
    if (progressA.error) throw progressA.error;
    assert.deepEqual(progressA.data, {
      streak_days: 4,
      longest_streak: 4,
      total_xp: 275,
      level: 3,
      requests_count: 4,
    });
  } finally {
    await admin.auth.admin.deleteUser(userA.id);
    await admin.auth.admin.deleteUser(userB.id);
  }
});
