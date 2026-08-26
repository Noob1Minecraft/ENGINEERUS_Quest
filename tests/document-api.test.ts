import assert from "node:assert/strict";
import test from "node:test";
import express, { type RequestHandler } from "express";
import { createDocumentsRouter } from "../server/routes/documents";
import type { DocumentRepository, PublicDocument } from "../server/persistence/documents";
import { apiErrorHandler } from "../server/middleware/apiErrorHandler";
import { withServer } from "./helpers";

const USER_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_ID = "a0000000-0000-4000-8000-000000000002";
const NOW = "2026-08-26T00:00:00.000Z";

function document(id: string): PublicDocument {
  return { id, original_filename: "notes.txt", file_type: "txt", mime_type: "text/plain", size_bytes: 12, status: "ready", page_count: null, issue: null, created_at: NOW, processed_at: NOW };
}

function appFixture(authenticated = true) {
  const records = new Map<string, { owner: string; value: PublicDocument }>();
  const state = { uploads: [] as string[], deleted: [] as string[] };
  const repository = {
    countDocuments: async () => records.size,
    async createProcessingDocument(input: { id: string; user_id: string }) {
      const value = { ...document(input.id), status: "processing" as const };
      records.set(input.id, { owner: input.user_id, value });
      return { ...input, ...value, storage_path: `${input.user_id}/${input.id}/original.txt`, failure_code: null, page_count: null, processed_at: null };
    },
    uploadObject: async (path: string) => { state.uploads.push(path); },
    async completeProcessing(userId: string, id: string) { const value = document(id); records.set(id, { owner: userId, value }); return value; },
    markFailed: async () => undefined,
    listDocuments: async (userId: string) => [...records.values()].filter((item) => item.owner === userId).map((item) => item.value),
    getDocument: async (userId: string, id: string) => records.get(id)?.owner === userId ? records.get(id)!.value : null,
    async deleteDocument(userId: string, id: string) { if (records.get(id)?.owner !== userId) return false; records.delete(id); state.deleted.push(id); return true; },
    loadAiContext: async () => ({ promptBlock: "", systemPolicy: "" }),
  } as unknown as DocumentRepository;
  const authenticate: RequestHandler = (_request, response, next) => {
    if (!authenticated) { response.status(401).json({ error: { code: "missing_bearer_token" } }); return; }
    response.locals.auth = { userId: USER_ID, accessToken: "test", claims: {} }; next();
  };
  const app = express();
  app.use(createDocumentsRouter(authenticate, (_request, _response, next) => next(), (_request, _response, next) => next(), repository));
  app.use(apiErrorHandler);
  return { app, records, state };
}

test("document upload requires auth and valid multipart content", async () => {
  const denied = appFixture(false);
  await withServer(denied.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/documents`, { method: "POST", body: new FormData() });
    assert.equal(response.status, 401);
  });
  const fixture = appFixture();
  await withServer(fixture.app, async (baseUrl) => {
    const form = new FormData();
    form.append("file", new Blob(["engineering notes"], { type: "text/plain" }), "notes.txt");
    const response = await fetch(`${baseUrl}/api/documents`, { method: "POST", body: form });
    assert.equal(response.status, 201);
    const body = await response.json() as { document: PublicDocument };
    assert.equal(body.document.status, "ready");
    assert.equal(fixture.state.uploads.length, 1);
    assert.match(fixture.state.uploads[0], new RegExp(`^${USER_ID}/[0-9a-f-]{36}/original\\.txt$`, "u"));
    assert.doesNotMatch(JSON.stringify(body), /storage_path|user_id|failure_code/iu);
  });
});

test("wrong signatures, unsupported files, traversal names, and empty uploads fail before storage", async () => {
  const fixture = appFixture();
  await withServer(fixture.app, async (baseUrl) => {
    for (const [name, type, content] of [["evil.pdf", "application/pdf", "MZ"], ["evil.exe", "application/octet-stream", "MZ"], ["../evil.txt", "text/plain", "x"], ["empty.txt", "text/plain", ""]]) {
      const form = new FormData(); form.append("file", new Blob([content], { type }), name);
      assert.equal((await fetch(`${baseUrl}/api/documents`, { method: "POST", body: form })).status, 400);
    }
  });
  assert.equal(fixture.state.uploads.length, 0);
});

test("multipart upload enforces the 10 MB parser limit, rejects extra fields, and applies the 20-document quota", async () => {
  const fixture = appFixture();
  await withServer(fixture.app, async (baseUrl) => {
    const oversized = new FormData();
    oversized.append("file", new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "text/plain" }), "large.txt");
    assert.equal((await fetch(`${baseUrl}/api/documents`, { method: "POST", body: oversized })).status, 413);

    const forged = new FormData();
    forged.append("owner_id", OTHER_ID);
    forged.append("file", new Blob(["safe"], { type: "text/plain" }), "notes.txt");
    assert.equal((await fetch(`${baseUrl}/api/documents`, { method: "POST", body: forged })).status, 400);

    for (let index = 0; index < 20; index += 1) {
      const id = `a1000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      fixture.records.set(id, { owner: USER_ID, value: document(id) });
    }
    const quota = new FormData(); quota.append("file", new Blob(["safe"], { type: "text/plain" }), "notes.txt");
    const response = await fetch(`${baseUrl}/api/documents`, { method: "POST", body: quota });
    assert.equal(response.status, 409);
    assert.equal((await response.json() as { error: { code: string } }).error.code, "document_quota_exceeded");
  });
  assert.equal(fixture.state.uploads.length, 0);
});

test("list, detail, and delete remain owner-scoped and expose only the public DTO", async () => {
  const fixture = appFixture();
  const ownId = "a1000000-0000-4000-8000-000000000001";
  const otherId = "a1000000-0000-4000-8000-000000000002";
  fixture.records.set(ownId, { owner: USER_ID, value: document(ownId) });
  fixture.records.set(otherId, { owner: OTHER_ID, value: document(otherId) });
  await withServer(fixture.app, async (baseUrl) => {
    const listed = await (await fetch(`${baseUrl}/api/documents`)).json() as { documents: PublicDocument[] };
    assert.deepEqual(listed.documents.map(({ id }) => id), [ownId]);
    assert.equal((await fetch(`${baseUrl}/api/documents/${otherId}`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/documents/${otherId}`, { method: "DELETE" })).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/documents/${ownId}`, { method: "DELETE" })).status, 204);
  });
  assert.deepEqual(fixture.state.deleted, [ownId]);
});
