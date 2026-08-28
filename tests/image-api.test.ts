import assert from "node:assert/strict";
import test from "node:test";
import express, { type RequestHandler } from "express";
import sharp from "sharp";
import { createImagesRouter } from "../server/routes/images";
import type { ImageRepository, PublicImage } from "../server/persistence/images";
import { apiErrorHandler } from "../server/middleware/apiErrorHandler";
import { withServer } from "./helpers";

const USER_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_ID = "a0000000-0000-4000-8000-000000000002";
const NOW = "2026-08-28T00:00:00.000Z";

function image(id: string): PublicImage {
  return { id, original_filename: "diagram.png", mime_type: "image/png", size_bytes: 100, width: 16, height: 12, status: "ready", issue: null, created_at: NOW, processed_at: NOW };
}

function appFixture(authenticated = true) {
  const records = new Map<string, { owner: string; value: PublicImage }>();
  const state = { uploads: [] as string[], deleted: [] as string[] };
  const repository = {
    countImages: async (userId: string) => [...records.values()].filter(({ owner }) => owner === userId).length,
    async createProcessingImage(input: { id: string; userId: string; storagePath: string; image: { displayName: string; mimeType: string; buffer: Buffer; width: number; height: number } }) {
      const value: PublicImage = { ...image(input.id), original_filename: input.image.displayName, mime_type: input.image.mimeType as PublicImage["mime_type"], size_bytes: input.image.buffer.length, width: input.image.width, height: input.image.height, status: "processing", processed_at: null };
      records.set(input.id, { owner: input.userId, value });
      return { ...value, user_id: input.userId, storage_path: input.storagePath, failure_code: null };
    },
    uploadObject: async (path: string) => { state.uploads.push(path); },
    async completeProcessing(userId: string, id: string) { const value = { ...records.get(id)!.value, status: "ready" as const, processed_at: NOW }; records.set(id, { owner: userId, value }); return value; },
    markFailed: async () => undefined,
    async listImages(userId: string) { return { items: [...records.values()].filter(({ owner }) => owner === userId).map(({ value }) => value), nextCursor: null }; },
    getImage: async (userId: string, id: string) => records.get(id)?.owner === userId ? records.get(id)!.value : null,
    async deleteImage(userId: string, id: string) { if (records.get(id)?.owner !== userId) return false; records.delete(id); state.deleted.push(id); return true; },
    loadAiImages: async () => [],
  } as unknown as ImageRepository;
  const authenticate: RequestHandler = (_request, response, next) => {
    if (!authenticated) { response.status(401).json({ error: { code: "missing_bearer_token" } }); return; }
    response.locals.auth = { userId: USER_ID, accessToken: "test", claims: {} }; next();
  };
  const app = express();
  app.use(createImagesRouter(authenticate, (_request, _response, next) => next(), (_request, _response, next) => next(), repository));
  app.use(apiErrorHandler);
  return { app, records, state };
}

test("image upload requires auth, normalizes safe content, and returns a narrow DTO", async () => {
  const buffer = await sharp({ create: { width: 16, height: 12, channels: 3, background: "white" } }).png().toBuffer();
  await withServer(appFixture(false).app, async (baseUrl) => {
    const form = new FormData(); form.append("file", new Blob([buffer], { type: "image/png" }), "diagram.png");
    assert.equal((await fetch(`${baseUrl}/api/images`, { method: "POST", body: form })).status, 401);
  });
  const fixture = appFixture();
  await withServer(fixture.app, async (baseUrl) => {
    const form = new FormData(); form.append("file", new Blob([buffer], { type: "image/png" }), "diagram.png");
    const response = await fetch(`${baseUrl}/api/images`, { method: "POST", body: form });
    assert.equal(response.status, 201);
    const body = await response.json() as { image: PublicImage };
    assert.equal(body.image.status, "ready");
    assert.match(fixture.state.uploads[0], new RegExp(`^${USER_ID}/images/[0-9a-f-]{36}/normalized\\.png$`, "u"));
    assert.doesNotMatch(JSON.stringify(body), /storage_path|user_id|failure_code|exif/iu);
  });
});

test("unsupported, mismatched, malformed, forged-field, and empty uploads fail before storage", async () => {
  const fixture = appFixture();
  await withServer(fixture.app, async (baseUrl) => {
    for (const [name, type, bytes] of [
      ["active.svg", "image/svg+xml", Buffer.from("<svg/>")],
      ["fake.png", "image/png", Buffer.from("MZ")],
      ["wrong.jpg", "image/png", await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).jpeg().toBuffer()],
      ["empty.png", "image/png", Buffer.alloc(0)],
    ] as const) {
      const form = new FormData(); form.append("file", new Blob([bytes], { type }), name);
      assert.equal((await fetch(`${baseUrl}/api/images`, { method: "POST", body: form })).status, 400);
    }
    const forged = new FormData(); forged.append("user_id", OTHER_ID); forged.append("file", new Blob([Buffer.from("x")], { type: "image/png" }), "x.png");
    assert.equal((await fetch(`${baseUrl}/api/images`, { method: "POST", body: forged })).status, 400);
  });
  assert.equal(fixture.state.uploads.length, 0);
});

test("list, detail, delete, query validation, and quota remain owner scoped", async () => {
  const fixture = appFixture();
  const ownId = "a1000000-0000-4000-8000-000000000001";
  const otherId = "a1000000-0000-4000-8000-000000000002";
  fixture.records.set(ownId, { owner: USER_ID, value: image(ownId) });
  fixture.records.set(otherId, { owner: OTHER_ID, value: image(otherId) });
  await withServer(fixture.app, async (baseUrl) => {
    const listed = await (await fetch(`${baseUrl}/api/images`)).json() as { items: PublicImage[]; next_cursor: null };
    assert.deepEqual(listed.items.map(({ id }) => id), [ownId]);
    assert.equal((await fetch(`${baseUrl}/api/images?cursor=not-a-cursor`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/images/${otherId}`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/images/${otherId}`, { method: "DELETE" })).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/images/${ownId}`, { method: "DELETE" })).status, 204);
  });
  assert.deepEqual(fixture.state.deleted, [ownId]);

  for (let index = 0; index < 30; index += 1) fixture.records.set(`b1000000-0000-4000-8000-${String(index).padStart(12, "0")}`, { owner: USER_ID, value: image(crypto.randomUUID()) });
  await withServer(fixture.app, async (baseUrl) => {
    const form = new FormData(); form.append("file", new Blob([Buffer.from("x")], { type: "image/png" }), "x.png");
    assert.equal((await fetch(`${baseUrl}/api/images`, { method: "POST", body: form })).status, 409);
  });
});
