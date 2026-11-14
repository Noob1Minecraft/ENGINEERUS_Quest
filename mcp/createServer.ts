import { McpServer } from "@modelcontextprotocol/server";

import { createGroqResponder } from "../server/ai/groqClient";
import { createTutorPipeline } from "../server/ai/tutor/pipeline";
import { loadServerEnv } from "../server/config/env";
import { createGiveHintHandler, giveHintInputSchema } from "./tools/giveHint";

export type GiveHintHandler = ReturnType<typeof createGiveHintHandler>;

export function createEngineerusMcpServer(giveHint: GiveHintHandler): McpServer {
  const server = new McpServer({ name: "engineerus-quest", version: "0.1.0" });

  server.registerTool(
    "give_hint",
    {
      title: "Give an engineering hint",
      description: "Return a guided Engineerus Quest hint without revealing a prohibited full answer.",
      inputSchema: giveHintInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (input, context) => giveHint(input, context.mcpReq.signal),
  );

  return server;
}

export function createConfiguredGiveHintHandler(source: NodeJS.ProcessEnv = process.env): GiveHintHandler {
  const env = loadServerEnv(source);
  if (!env.GROQ_API_KEY && !env.GROQ_API_KEY_2) {
    throw new Error("The MCP server requires an existing Groq credential.");
  }

  const generate = createGroqResponder({
    apiKey: env.GROQ_API_KEY,
    secondaryApiKey: env.GROQ_API_KEY_2,
    model: env.GROQ_MODEL,
  });

  return createGiveHintHandler(createTutorPipeline(generate));
}
