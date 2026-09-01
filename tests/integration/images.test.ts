import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import express from "express";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { loadServerEnv } from "../../server/config/env";
import { createSupabaseAccessTokenVerifier } from "../../server/auth/supabaseJwt";
import { createRequireAuth } from "../../server/middleware/requireAuth";
import { createImageRepository } from "../../server/persistence/images";
import { createImagesRouter } from "../../server/routes/images";
import { apiErrorHandler } from "../../server/middleware/apiErrorHandler";
import { withServer } from "../helpers";

const url = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.TEST_SUPABASE_SECRET_KEY;
if (!url || !publishableKey || !secretKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/iu.test(url)) {
  throw new Error("Image integration tests require the local loopback Supabase stack.");
}

const env = loadServerEnv({ NODE_ENV: "test", SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishableKey, SUPABASE_SECRET_KEY: secretKey });
const admin = createClient(url, secretKey, { auth: { persistSession: false } });

async function identity(label: string) {
  const email = `images-${label}-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9a!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Local user creation failed.");
  const browser = createClient(url!, publishableKey!, { auth: { persistSession: false } });
  const signedIn = await browser.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Local sign-in failed.");
  return { id: created.data.user.id, token: signedIn.data.session.access_token, browser };
}

test("local image storage, metadata, ownership, AI loading, and deletion stay private", async () => {
  const userA = await identity("a");
  const userB = await identity("b");
  const repository = createImageRepository(env);
  const authenticate = createRequireAuth(createSupabaseAccessTokenVerifier(env));
  const noLimit = (_request: express.Request, _response: express.Response, next: express.NextFunction) => next();
  const app = express();
  app.use(createImagesRouter(authenticate, noLimit, noLimit, repository));
  app.use(apiErrorHandler);

  let imageId = "";
  try {
    const diagram = await sharp({ create: { width: 320, height: 200, channels: 3, background: "white" } }).png().toBuffer();
    await withServer(app, async (baseUrl) => {
      const form = new FormData(); form.append("file", new Blob([diagram], { type: "image/png" }), "private-diagram.png");
      const uploaded = await fetch(`${baseUrl}/api/images`, { method: "POST", headers: { Authorization: `Bearer ${userA.token}` }, body: form });
      assert.equal(uploaded.status, 201);
      const body = await uploaded.json() as { image: { id: string; status: string; width: number; height: number } };
      imageId = body.image.id;
      assert.equal(body.image.status, "ready");
      assert.ok(body.image.width > 0 && body.image.height > 0);

      const aList = await (await fetch(`${baseUrl}/api/images`, { headers: { Authorization: `Bearer ${userA.token}` } })).json() as { items: Array<{ id: string }> };
      const bList = await (await fetch(`${baseUrl}/api/images`, { headers: { Authorization: `Bearer ${userB.token}` } })).json() as { items: Array<{ id: string }> };
      assert.ok(aList.items.some(({ id }) => id === imageId));
      assert.ok(!bList.items.some(({ id }) => id === imageId));
      assert.equal((await fetch(`${baseUrl}/api/images/${imageId}`, { headers: { Authorization: `Bearer ${userB.token}` } })).status, 404);
      assert.equal((await fetch(`${baseUrl}/api/images/${imageId}`, { method: "DELETE", headers: { Authorization: `Bearer ${userB.token}` } })).status, 404);

      const context = await repository.loadAiImages(userA.id, [imageId]);
      assert.equal(context.length, 1);
      assert.equal(context[0].id, imageId);
      assert.equal(context[0].mimeType, "image/png");
      await assert.rejects(() => repository.loadAiImages(userB.id, [imageId]), /image_not_found|not found/iu);

      const directStorage = await userA.browser.storage.from("engineerus-documents").list(`${userA.id}/images`);
      assert.equal(directStorage.data?.length, 0, "browser cannot enumerate its server-mediated images");
      const crossStorage = await userB.browser.storage.from("engineerus-documents").list(`${userA.id}/images`);
      assert.equal(crossStorage.data?.length, 0, "another browser user cannot enumerate owner images");
      const unsafeColumn = await userA.browser.from("ai_images").select("storage_path").eq("id", imageId);
      assert.ok(unsafeColumn.error, "browser cannot select private image storage paths");

      const stored = await admin.storage.from("engineerus-documents").list(`${userA.id}/images/${imageId}`);
      assert.equal(stored.error, null);
      assert.deepEqual(stored.data.map(({ name }) => name), ["normalized.png"]);

      assert.equal((await fetch(`${baseUrl}/api/images/${imageId}`, { method: "DELETE", headers: { Authorization: `Bearer ${userA.token}` } })).status, 204);
      const rows = await admin.from("ai_images").select("id").eq("id", imageId);
      const removed = await admin.storage.from("engineerus-documents").list(`${userA.id}/images/${imageId}`);
      assert.equal(rows.data?.length, 0);
      assert.equal(removed.data?.length, 0);
    });
  } finally {
    if (imageId) await repository.deleteImage(userA.id, imageId).catch(() => undefined);
    await admin.auth.admin.deleteUser(userA.id);
    await admin.auth.admin.deleteUser(userB.id);
  }
});
