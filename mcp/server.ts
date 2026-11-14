import "dotenv/config";

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { createConfiguredGiveHintHandler, createEngineerusMcpServer } from "./createServer";

async function main(): Promise<void> {
  // The shared backend logger uses console.log. In a stdio MCP process,
  // stdout is reserved exclusively for JSON-RPC frames.
  console.log = (...args: unknown[]) => console.error(...args);

  const giveHint = createConfiguredGiveHintHandler();
  const server = createEngineerusMcpServer(giveHint);

  await server.connect(new StdioServerTransport());
}

main().catch(() => {
  // stdout is reserved for MCP JSON-RPC frames. Never expose internal errors to clients.
  console.error("Engineerus Quest MCP server failed to start.");
  process.exitCode = 1;
});
