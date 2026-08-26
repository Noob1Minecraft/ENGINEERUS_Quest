import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { loadServerEnv } from "../../server/config/env";
import { createProfileRepository } from "../../server/persistence/profiles";

const url = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.TEST_SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/iu.test(url)) {
  throw new Error("Profile relation integration tests require the local loopback Supabase stack.");
}

test("profile repository replaces all normalized relation sets through the atomic RPC", async () => {
  const admin = createClient(url, secretKey, { auth: { persistSession: false } });
  const email = `profile-relations-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9a!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: `relations_${crypto.randomUUID().slice(0, 8)}` },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error("Local test user was not created.");

  try {
    const userClient = createClient(url, publishableKey, { auth: { persistSession: false } });
    const signedIn = await userClient.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Local test user did not sign in.");

    const repository = createProfileRepository(loadServerEnv({
      NODE_ENV: "test",
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_SECRET_KEY: secretKey,
    }));
    const userId = created.data.user.id;
    const token = signedIn.data.session.access_token;
    const updated = await repository.updateProfile(userId, token, {
      avatar_url: "https://images.example.test/avatar.png",
      skills: [{ id: "20000000-0000-4000-8000-000000000001", proficiency: 4 }],
      tools: [{ id: "30000000-0000-4000-8000-000000000001", proficiency: 3 }],
      interests: ["40000000-0000-4000-8000-000000000001"],
      languages: [{ language_code: "ru", proficiency: 5 }],
    });
    assert.equal(updated.avatar_url, "https://images.example.test/avatar.png");
    assert.deepEqual(updated.skills.map(({ id }) => id), ["20000000-0000-4000-8000-000000000001"]);
    assert.deepEqual(updated.tools.map(({ id }) => id), ["30000000-0000-4000-8000-000000000001"]);
    assert.deepEqual(updated.interests.map(({ id }) => id), ["40000000-0000-4000-8000-000000000001"]);
    assert.deepEqual(updated.languages.map(({ language_code }) => language_code), ["ru"]);

    const cleared = await repository.updateProfile(userId, token, {
      skills: [], tools: [], interests: [], languages: [],
    });
    assert.deepEqual(cleared.skills, []);
    assert.deepEqual(cleared.tools, []);
    assert.deepEqual(cleared.interests, []);
    assert.deepEqual(cleared.languages, []);
  } finally {
    await admin.auth.admin.deleteUser(created.data.user.id);
  }
});
