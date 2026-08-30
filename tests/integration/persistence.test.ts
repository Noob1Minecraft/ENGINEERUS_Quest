import assert from "node:assert/strict";
import test from "node:test";
import express, { type RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import { loadServerEnv } from "../../server/config/env";
import { createSupabaseAccessTokenVerifier } from "../../server/auth/supabaseJwt";
import { createRequireAuth } from "../../server/middleware/requireAuth";
import { createChatRepository } from "../../server/persistence/chats";
import { createQuestRepository } from "../../server/persistence/quests";
import { createChatsRouter } from "../../server/routes/chats";
import { createAiRouter } from "../../server/routes/ai";
import { createQuestsRouter } from "../../server/routes/quests";
import {
  createCanonicalUserLoader,
  createDailyActivityRecorder,
  createMeRouter,
} from "../../server/routes/me";
import { createSupabaseUserClient } from "../../server/lib/supabaseUser";
import { withServer } from "../helpers";

const url = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.TEST_SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(url)) {
  throw new Error("Persistence integration tests require the local loopback Supabase stack.");
}

const env = loadServerEnv({
  NODE_ENV: "test",
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SECRET_KEY: secretKey,
});

type TestIdentity = { id: string; token: string };

async function createIdentity(label: string): Promise<TestIdentity> {
  const admin = createClient(url!, secretKey!, { auth: { persistSession: false } });
  const email = `persistence-${label}-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9a!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Local test user was not created.");

  const browser = createClient(url!, publishableKey!, { auth: { persistSession: false } });
  const signedIn = await browser.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Local test user did not sign in.");
  return { id: created.data.user.id, token: signedIn.data.session.access_token };
}

function createTestApp(generateResponse: () => Promise<string>) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const authenticate = createRequireAuth(createSupabaseAccessTokenVerifier(env));
  const noLimit: RequestHandler = (_request, _response, next) => next();
  const chats = createChatRepository(env);
  const quests = createQuestRepository(env);
  app.use(createMeRouter(
    authenticate,
    noLimit,
    createCanonicalUserLoader(env),
    createDailyActivityRecorder(env),
  ));
  app.use(createChatsRouter(authenticate, noLimit, chats));
  app.use(createQuestsRouter(authenticate, noLimit, quests));
  app.use(createAiRouter(authenticate, noLimit, {
    repository: chats,
    detectLanguage: (_text, requested) => requested,
    generateResponse: async () => generateResponse(),
  }));
  return app;
}

function authorization(identity: TestIdentity) {
  return { Authorization: `Bearer ${identity.token}`, "Content-Type": "application/json" };
}

test("local PostgreSQL persistence and ownership API", async (t) => {
  const admin = createClient(url, secretKey, { auth: { persistSession: false } });
  const userA = await createIdentity("a");
  const userB = await createIdentity("b");
  const userAClient = createSupabaseUserClient(env, userA.token);
  let aiCalls = 0;
  const app = createTestApp(async () => {
    aiCalls += 1;
    return "Persisted assistant response";
  });

  try {
    await withServer(app, async (baseUrl) => {
      let sessionA = "";
      let sessionB = "";

      await t.test("create/read/update own chat and ignore forged ownership fields", async () => {
        const created = await fetch(`${baseUrl}/api/chats`, {
          method: "POST",
          headers: authorization(userA),
          body: JSON.stringify({
            title: "Persistent A",
            module: "tutor",
            user_id: userB.id,
            email: "forged@example.test",
          }),
        });
        assert.equal(created.status, 201);
        const createdBody = await created.json() as { session: { id: string; title: string } };
        sessionA = createdBody.session.id;

        const ownerRow = await userAClient.from("chat_sessions").select("user_id").eq("id", sessionA).single();
        assert.equal(ownerRow.data?.user_id, userA.id);

        const listed = await fetch(`${baseUrl}/api/chats`, { headers: authorization(userA) });
        const listedBody = await listed.json() as { sessions: Array<{ id: string }> };
        assert.ok(listedBody.sessions.some((session) => session.id === sessionA));

        const updated = await fetch(`${baseUrl}/api/chats/${sessionA}`, {
          method: "PATCH",
          headers: authorization(userA),
          body: JSON.stringify({ title: "Renamed persistent chat", user_id: userB.id }),
        });
        assert.equal(updated.status, 200);
        assert.equal((await updated.json() as { session: { title: string } }).session.title, "Renamed persistent chat");
      });

      await t.test("cross-user chat and message access is denied", async () => {
        const created = await fetch(`${baseUrl}/api/chats`, {
          method: "POST",
          headers: authorization(userB),
          body: JSON.stringify({ title: "Persistent B", module: "tutor" }),
        });
        sessionB = (await created.json() as { session: { id: string } }).session.id;

        const crossRead = await fetch(`${baseUrl}/api/chats/${sessionB}/messages`, { headers: authorization(userA) });
        assert.equal(crossRead.status, 404);

        const crossRename = await fetch(`${baseUrl}/api/chats/${sessionB}`, {
          method: "PATCH",
          headers: authorization(userA),
          body: JSON.stringify({ title: "Forged rename" }),
        });
        assert.equal(crossRename.status, 404);

        const crossDelete = await fetch(`${baseUrl}/api/chats/${sessionB}`, {
          method: "DELETE",
          headers: authorization(userA),
        });
        assert.equal(crossDelete.status, 404);

        const ownerList = await fetch(`${baseUrl}/api/chats`, { headers: authorization(userB) });
        const ownerListBody = await ownerList.json() as { sessions: Array<{ id: string; title: string }> };
        assert.ok(ownerListBody.sessions.some((session) => session.id === sessionB && session.title === "Persistent B"));

        const crossAppend = await fetch(`${baseUrl}/api/module`, {
          method: "POST",
          headers: { ...authorization(userA), "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ session_id: sessionB, module: "tutor", text: "forged", lang: "en" }),
        });
        assert.equal(crossAppend.status, 404);
      });

      await t.test("user/assistant messages and canonical XP persist idempotently", async () => {
        const requestId = crypto.randomUUID();
        const requestBody = JSON.stringify({
          session_id: sessionA,
          module: "tutor",
          text: "Persist this exchange",
          lang: "en",
          xp: 999999,
          xp_reward: 999999,
          user_id: userB.id,
          email: "forged@example.test",
        });
        const first = await fetch(`${baseUrl}/api/module`, {
          method: "POST",
          headers: { ...authorization(userA), "Idempotency-Key": requestId },
          body: requestBody,
        });
        assert.equal(first.status, 200);
        const firstBody = await first.json() as { xp: number; requests_count: number; response: string };
        assert.equal(firstBody.xp, 15);
        assert.equal(firstBody.requests_count, 1);
        assert.equal(firstBody.response, "Persisted assistant response");

        const duplicate = await fetch(`${baseUrl}/api/module`, {
          method: "POST",
          headers: { ...authorization(userA), "Idempotency-Key": requestId },
          body: requestBody,
        });
        const duplicateBody = await duplicate.json() as { xp: number; requests_count: number; idempotent_replay: boolean };
        assert.equal(duplicate.status, 200);
        assert.equal(duplicateBody.xp, 15);
        assert.equal(duplicateBody.requests_count, 1);
        assert.equal(duplicateBody.idempotent_replay, true);
        assert.equal(aiCalls, 1);

        const messages = await fetch(`${baseUrl}/api/chats/${sessionA}/messages`, { headers: authorization(userA) });
        const messageBody = await messages.json() as { messages: Array<{ sender: string; text: string }> };
        assert.deepEqual(messageBody.messages.map((message) => message.sender), ["user", "ai"]);
        assert.equal(messageBody.messages[1].text, "Persisted assistant response");

        const ledger = await userAClient
          .from("xp_ledger")
          .select("amount")
          .eq("user_id", userA.id)
          .eq("source_type", "ai_module");
        assert.deepEqual(ledger.data?.map((row) => row.amount), [15]);

        const me = await fetch(`${baseUrl}/api/me`, { headers: authorization(userA) });
        const meBody = await me.json() as { progress: { total_xp: number; requests_count: number } };
        assert.equal(meBody.progress.total_xp, 15);
        assert.equal(meBody.progress.requests_count, 1);
      });

      await t.test("persistence survives a fresh server/repository instance", async () => {
        const restarted = createTestApp(async () => "unused");
        await withServer(restarted, async (restartedUrl) => {
          const response = await fetch(`${restartedUrl}/api/chats/${sessionA}/messages`, {
            headers: authorization(userA),
          });
          assert.equal(response.status, 200);
          assert.equal((await response.json() as { messages: unknown[] }).messages.length, 2);
        });
      });

      await t.test("bounded chat cursors remain stable across identical timestamps", async () => {
        const sessionInsert = await userAClient
          .from("chat_sessions")
          .insert(Array.from({ length: 7 }, (_, index) => ({
            user_id: userA.id,
            title: `Pagination session ${index}`,
            module: "tutor",
          })))
          .select("id,updated_at");
        assert.equal(sessionInsert.error, null);
        const insertedSessionIds = new Set((sessionInsert.data ?? []).map((row) => row.id));
        assert.equal(new Set((sessionInsert.data ?? []).map((row) => row.updated_at)).size, 1);

        const seenSessionIds: string[] = [];
        let sessionCursor: string | null = null;
        do {
          const suffix: string = sessionCursor ? `&cursor=${encodeURIComponent(sessionCursor)}` : "";
          const response = await fetch(`${baseUrl}/api/chats?limit=3${suffix}`, {
            headers: authorization(userA),
          });
          assert.equal(response.status, 200);
          const page = await response.json() as {
            items: Array<{ id: string; updatedAt: string }>;
            next_cursor: string | null;
          };
          assert.ok(page.items.length <= 3);
          seenSessionIds.push(...page.items.map((item) => item.id));
          sessionCursor = page.next_cursor;
        } while (sessionCursor);

        assert.equal(new Set(seenSessionIds).size, seenSessionIds.length);
        for (const id of insertedSessionIds) assert.ok(seenSessionIds.includes(id));
        assert.ok(seenSessionIds.includes(sessionA));

        const messageInsert = await userAClient
          .from("chat_messages")
          .insert(Array.from({ length: 7 }, (_, index) => ({
            session_id: sessionA,
            user_id: userA.id,
            role: "user",
            content: `Pagination message ${index}`,
            module: "tutor",
          })))
          .select("id,created_at");
        assert.equal(messageInsert.error, null);
        const insertedMessageIds = new Set((messageInsert.data ?? []).map((row) => row.id));
        assert.equal(new Set((messageInsert.data ?? []).map((row) => row.created_at)).size, 1);

        const seenMessageIds: string[] = [];
        let messageCursor: string | null = null;
        do {
          const suffix: string = messageCursor ? `&cursor=${encodeURIComponent(messageCursor)}` : "";
          const response = await fetch(`${baseUrl}/api/chats/${sessionA}/messages?limit=3${suffix}`, {
            headers: authorization(userA),
          });
          assert.equal(response.status, 200);
          const page = await response.json() as {
            items: Array<{ id: string; timestamp: string }>;
            next_cursor: string | null;
          };
          assert.ok(page.items.length <= 3);
          assert.deepEqual(
            page.items,
            [...page.items].sort((left, right) =>
              left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id)),
          );
          seenMessageIds.push(...page.items.map((item) => item.id));
          messageCursor = page.next_cursor;
        } while (messageCursor);

        assert.equal(new Set(seenMessageIds).size, seenMessageIds.length);
        for (const id of insertedMessageIds) assert.ok(seenMessageIds.includes(id));
      });

      await t.test("quest rewards ignore client values and remain atomic/idempotent", async () => {
        const definitions = await fetch(`${baseUrl}/api/quests`, { headers: authorization(userA) });
        const definitionBody = await definitions.json() as { quests: Array<{ id: string; xp_reward: number }> };
        assert.equal(definitionBody.quests.find((quest) => quest.id === "first_contact")?.xp_reward, 20);

        const premature = await fetch(`${baseUrl}/api/quests/complete`, {
          method: "POST",
          headers: authorization(userB),
          body: JSON.stringify({ quest_id: "first_contact", xp_reward: 999999 }),
        });
        assert.equal(premature.status, 409);

        const first = await fetch(`${baseUrl}/api/quests/complete`, {
          method: "POST",
          headers: authorization(userA),
          body: JSON.stringify({ quest_id: "first_contact", xp_reward: 999999, reward: 999999, user_id: userB.id }),
        });
        assert.equal(first.status, 200);
        const firstBody = await first.json() as { xp_awarded: number; total_xp: number; awarded: boolean };
        assert.equal(firstBody.awarded, true);
        assert.equal(firstBody.xp_awarded, 20);
        assert.equal(firstBody.total_xp, 35);

        const duplicate = await fetch(`${baseUrl}/api/quests/complete`, {
          method: "POST",
          headers: authorization(userA),
          body: JSON.stringify({ quest_id: "first_contact", xp_reward: 999999 }),
        });
        const duplicateBody = await duplicate.json() as { xp_awarded: number; total_xp: number; awarded: boolean };
        assert.equal(duplicate.status, 200);
        assert.equal(duplicateBody.awarded, false);
        assert.equal(duplicateBody.xp_awarded, 0);
        assert.equal(duplicateBody.total_xp, 35);

        const questLedger = await userAClient
          .from("xp_ledger")
          .select("amount")
          .eq("user_id", userA.id)
          .eq("source_type", "quest");
        assert.deepEqual(questLedger.data?.map((row) => row.amount), [20]);
      });

      await t.test("delete own chat removes canonical rows", async () => {
        const deleted = await fetch(`${baseUrl}/api/chats/${sessionA}`, {
          method: "DELETE",
          headers: authorization(userA),
        });
        assert.equal(deleted.status, 204);
        const row = await userAClient.from("chat_sessions").select("id").eq("id", sessionA).maybeSingle();
        assert.equal(row.data, null);
      });
    });
  } finally {
    await admin.auth.admin.deleteUser(userA.id);
    await admin.auth.admin.deleteUser(userB.id);
  }
});
