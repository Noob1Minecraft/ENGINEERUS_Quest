import "dotenv/config";

import { timingSafeEqual } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { createMcpHandler, type McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";

import { createConfiguredGiveHintHandler, createEngineerusMcpServer } from "./createServer";

const DEFAULT_PORT = 3100;
const MAX_REQUEST_BODY_SIZE = 64 * 1024;
const BURST_WINDOW_MS = 10_000;
const SUSTAINED_WINDOW_MS = 60_000;
const DEFAULT_BURST_LIMIT = 8;
const DEFAULT_SUSTAINED_LIMIT = 30;
const MIN_AUTH_TOKEN_LENGTH = 32;

type RemoteMcpHttpServerOptions = {
  authToken: string;
  createMcpServer: () => McpServer;
  burstLimit?: number;
  sustainedLimit?: number;
  now?: () => number;
};

type RemoteMcpConfig = {
  enabled: boolean;
  authToken: string;
  port: number;
};

function json(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function safeTokenEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function readBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  return token.length > 0 ? token : null;
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function createInMemoryLimiter(options: {
  burstLimit?: number;
  sustainedLimit?: number;
  now: () => number;
}) {
  const burstLimit = positiveLimit(options.burstLimit, DEFAULT_BURST_LIMIT);
  const sustainedLimit = positiveLimit(options.sustainedLimit, DEFAULT_SUSTAINED_LIMIT);
  let burstRequests: number[] = [];
  let sustainedRequests: number[] = [];

  return () => {
    const now = options.now();
    burstRequests = burstRequests.filter((timestamp) => now - timestamp < BURST_WINDOW_MS);
    sustainedRequests = sustainedRequests.filter((timestamp) => now - timestamp < SUSTAINED_WINDOW_MS);

    const burstBlocked = burstRequests.length >= burstLimit;
    const sustainedBlocked = sustainedRequests.length >= sustainedLimit;
    if (burstBlocked || sustainedBlocked) {
      const retryAt = Math.max(
        burstBlocked ? (burstRequests[0] ?? now) + BURST_WINDOW_MS : now,
        sustainedBlocked ? (sustainedRequests[0] ?? now) + SUSTAINED_WINDOW_MS : now,
      );
      return { allowed: false as const, retryAfter: Math.max(1, Math.ceil((retryAt - now) / 1_000)) };
    }

    burstRequests.push(now);
    sustainedRequests.push(now);
    return { allowed: true as const };
  };
}

export function loadRemoteMcpConfig(source: NodeJS.ProcessEnv = process.env): RemoteMcpConfig {
  const portText = source.MCP_PORT || source.PORT || String(DEFAULT_PORT);
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("MCP_PORT must be a valid TCP port.");
  }

  return {
    enabled: source.MCP_REMOTE_ENABLED === "true",
    authToken: source.MCP_AUTH_TOKEN ?? "",
    port,
  };
}

export function createRemoteMcpHttpServer(options: RemoteMcpHttpServerOptions): Server {
  if (options.authToken.length < MIN_AUTH_TOKEN_LENGTH) {
    throw new Error(`MCP_AUTH_TOKEN must contain at least ${MIN_AUTH_TOKEN_LENGTH} characters.`);
  }

  const handler = createMcpHandler(options.createMcpServer, {
    legacy: "stateless",
    maxRequestBodySize: MAX_REQUEST_BODY_SIZE,
    onerror: () => console.error("Remote MCP request failed."),
  });
  const nodeHandler = toNodeHandler(handler, {
    maxRequestBodySize: MAX_REQUEST_BODY_SIZE,
    onerror: () => console.error("Remote MCP request failed."),
  });
  const checkLimit = createInMemoryLimiter({
    burstLimit: options.burstLimit,
    sustainedLimit: options.sustainedLimit,
    now: options.now ?? Date.now,
  });

  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");

    if (req.url === "/health" && req.method === "GET") {
      json(res, 200, { status: "ok" });
      return;
    }
    if (req.url !== "/mcp") {
      json(res, 404, { error: "Not found." });
      return;
    }
    if (req.headers.origin) {
      json(res, 403, { error: "Browser-origin requests are not allowed." });
      return;
    }

    const bearer = readBearerToken(req.headers.authorization);
    if (!bearer || !safeTokenEquals(bearer, options.authToken)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      json(res, 401, { error: "Unauthorized." });
      return;
    }

    const contentLength = Number(req.headers["content-length"] ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_SIZE) {
      json(res, 413, { error: "Request body is too large." });
      return;
    }

    const limit = checkLimit();
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfter));
      json(res, 429, { error: "Too many requests." });
      return;
    }

    try {
      await nodeHandler(req, res);
    } catch {
      if (!res.headersSent) json(res, 500, { error: "MCP request failed." });
      else res.end();
    }
  });

  server.once("close", () => void handler.close());
  return server;
}

export async function main(): Promise<void> {
  const config = loadRemoteMcpConfig();
  if (!config.enabled) throw new Error("Remote MCP is disabled.");
  if (config.authToken.length < MIN_AUTH_TOKEN_LENGTH) {
    throw new Error(`MCP_AUTH_TOKEN must contain at least ${MIN_AUTH_TOKEN_LENGTH} characters.`);
  }

  const giveHint = createConfiguredGiveHintHandler();
  const server = createRemoteMcpHttpServer({
    authToken: config.authToken,
    createMcpServer: () => createEngineerusMcpServer(giveHint),
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(config.port, "0.0.0.0", resolvePromise);
  });
  console.error(`Engineerus Quest remote MCP listening on port ${config.port}.`);
}

const isMain = Boolean(process.argv[1]) && resolve(process.argv[1]!) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(() => {
    console.error("Engineerus Quest remote MCP server failed to start.");
    process.exitCode = 1;
  });
}
