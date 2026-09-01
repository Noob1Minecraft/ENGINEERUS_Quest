import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, buildApiUrl, createApiFetch } from "../src/utils/api";

test("apiFetch normalizes URLs and attaches the current bearer token", async () => {
  let requestUrl = "";
  let requestHeaders = new Headers();
  const apiFetch = createApiFetch({
    apiUrl: "https://api.example.com///",
    getAccessToken: async () => "session-token",
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  const result = await apiFetch<{ ok: boolean }>("/api/me", {
    method: "POST",
    body: JSON.stringify({ display: "safe" }),
    headers: { "X-Test": "preserved" },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(requestUrl, "https://api.example.com/api/me");
  assert.equal(requestHeaders.get("authorization"), "Bearer session-token");
  assert.equal(requestHeaders.get("content-type"), "application/json");
  assert.equal(requestHeaders.get("x-test"), "preserved");
});

test("apiFetch handles 204 and structured 401 errors", async () => {
  const noContent = createApiFetch({
    apiUrl: "",
    getAccessToken: async () => "token",
    fetchImpl: async () => new Response(null, { status: 204 }),
  });
  assert.equal(await noContent("api/logout"), undefined);

  const unauthorized = createApiFetch({
    apiUrl: "",
    getAccessToken: async () => null,
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: "invalid_access_token", message: "Authentication is required." },
    }), { status: 401, headers: { "Content-Type": "application/json" } }),
  });
  await assert.rejects(
    unauthorized("/api/me"),
    (error) => error instanceof ApiError
      && error.status === 401
      && error.code === "invalid_access_token",
  );
});

test("apiFetch rejects absolute endpoints to avoid credential forwarding", () => {
  assert.throws(() => buildApiUrl("https://api.example.com", "https://evil.example/api"));
});
