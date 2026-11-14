import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createEngineerusMcpServer } from "../mcp/createServer";
import { createRemoteMcpHttpServer } from "../mcp/httpServer";
import { createGiveHintHandler } from "../mcp/tools/giveHint";

const AUTH_TOKEN = "test-only-bearer-token-with-32-chars";

async function startTestServer(options: {
  giveHint?: ReturnType<typeof createGiveHintHandler>;
  burstLimit?: number;
  sustainedLimit?: number;
}) {
  const giveHint = options.giveHint ?? createGiveHintHandler(async () => "Use the governing law first.");
  const server = createRemoteMcpHttpServer({
    authToken: AUTH_TOKEN,
    createMcpServer: () => createEngineerusMcpServer(giveHint),
    burstLimit: options.burstLimit,
    sustainedLimit: options.sustainedLimit,
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function mcpRequest(baseUrl: string, body: unknown, token = AUTH_TOKEN): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function readMcpPayload<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = body.split(/\r?\n/).find((line) => line.startsWith("data: "))?.slice(6);
    if (!data) throw new Error("MCP SSE response did not contain a data frame.");
    return JSON.parse(data) as T;
  }
  return JSON.parse(body) as T;
}

test("remote MCP starts and exposes a minimal health check", async (t) => {
  const app = await startTestServer({});
  t.after(app.close);

  const response = await fetch(`${app.baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("remote MCP rejects missing and invalid bearer credentials without leaking them", async (t) => {
  const app = await startTestServer({});
  t.after(app.close);
  const request = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

  const missing = await fetch(`${app.baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const invalid = await mcpRequest(app.baseUrl, request, "invalid-test-secret-that-must-not-leak");
  const invalidBody = await invalid.text();

  assert.equal(missing.status, 401);
  assert.equal(invalid.status, 401);
  assert.match(invalid.headers.get("www-authenticate") ?? "", /^Bearer$/);
  assert.doesNotMatch(invalidBody, /invalid-test-secret|stack|authorization/i);
});

test("authorized MCP clients can list only the existing give_hint tool", async (t) => {
  const app = await startTestServer({});
  t.after(app.close);

  const response = await mcpRequest(app.baseUrl, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  const payload = await readMcpPayload<{ result?: { tools?: Array<{ name: string }> } }>(response);

  assert.equal(response.status, 200);
  assert.deepEqual(payload.result?.tools?.map((tool) => tool.name), ["give_hint"]);
});

test("authorized give_hint calls reuse the existing Tutor handler", async (t) => {
  const observed: unknown[] = [];
  const giveHint = createGiveHintHandler(async (input) => {
    observed.push(input);
    return "Start by choosing the relevant electrical law.";
  });
  const app = await startTestServer({ giveHint });
  t.after(app.close);

  const response = await mcpRequest(app.baseUrl, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "give_hint",
      arguments: { problem: "How should I begin an Ohm-law task?", language: "en" },
    },
  });
  const payload = await readMcpPayload<{ result?: { content?: Array<{ text?: string }> } }>(response);

  assert.equal(response.status, 200);
  assert.match(payload.result?.content?.[0]?.text ?? "", /choosing the relevant electrical law/i);
  assert.equal(observed.length, 1);
  assert.equal((observed[0] as { plan: { mode: string } }).plan.mode, "hint");
});

test("remote give_hint rejects invalid input safely without invoking Tutor", async (t) => {
  let calls = 0;
  const giveHint = createGiveHintHandler(async () => {
    calls += 1;
    return "unused";
  });
  const app = await startTestServer({ giveHint });
  t.after(app.close);

  const response = await mcpRequest(app.baseUrl, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "give_hint", arguments: { problem: "", language: "de" } },
  });
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(calls, 0);
  assert.match(body, /invalid/i);
  assert.doesNotMatch(body, /stack|groq|api[_-]?key/i);
});

test("remote MCP rejects oversized bodies before tool execution", async (t) => {
  let calls = 0;
  const giveHint = createGiveHintHandler(async () => {
    calls += 1;
    return "unused";
  });
  const app = await startTestServer({ giveHint });
  t.after(app.close);

  const response = await mcpRequest(app.baseUrl, {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "give_hint", arguments: { problem: "x".repeat(70_000), language: "en" } },
  });

  assert.equal(response.status, 413);
  assert.equal(calls, 0);
});

test("remote MCP applies bounded in-memory throttling to authorized requests", async (t) => {
  const app = await startTestServer({ burstLimit: 1, sustainedLimit: 10 });
  t.after(app.close);
  const request = { jsonrpc: "2.0", id: 6, method: "tools/list", params: {} };

  const first = await mcpRequest(app.baseUrl, request);
  const second = await mcpRequest(app.baseUrl, request);

  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.match(second.headers.get("retry-after") ?? "", /^\d+$/);
});

test("remote MCP rejects browser-origin requests instead of enabling broad CORS", async (t) => {
  const app = await startTestServer({});
  t.after(app.close);

  const response = await fetch(`${app.baseUrl}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${AUTH_TOKEN}`,
      "content-type": "application/json",
      origin: "https://untrusted.example",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} }),
  });

  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /untrusted\.example|stack/i);
});
