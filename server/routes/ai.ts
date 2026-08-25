import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { ChatModule, ChatRepository } from "../persistence/chats";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";
import { createIdempotencyKey } from "../services/progress";
import { sanitizeAssistantContent } from "../ai/responseSafety";
import {
  buildStrictStandardsAllowlistPolicy,
  preparePromptWithStandardsMetadata,
  type StandardsLookup,
} from "../standards/standardsPolicy";
import {
  extractStandardIdentifiers,
  guardStandardsResponse,
  verifiedStandardDesignations,
} from "../standards/standardsResponseGuard";
import { buildVerifiedStandardsResponse } from "../standards/verifiedStandardsResponse";
import type { SupportedLanguage } from "../ai/languagePolicy";
import { AiProviderError } from "../ai/groqClient";

const MODULES = ["tutor", "material", "patent", "engi_legal", "engi_match"] as const;
const baseAiRequestSchema = z.object({
  text: z.string().max(20_000).refine((value) => value.trim().length > 0),
  lang: z.enum(["ru", "kk", "en"]).default("ru"),
  session_id: z.string().uuid(),
}).strip();
const moduleAiRequestSchema = baseAiRequestSchema.extend({ module: z.enum(MODULES) }).strip();

type AiRequest = z.infer<typeof baseAiRequestSchema>;

function safeAsync(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function sendInvalidAiRequest(response: import("express").Response, moduleRequest = false): void {
  response.status(400).json({
    error: {
      code: moduleRequest ? "invalid_module_request" : "invalid_ai_request",
      message: moduleRequest
        ? "A valid module, chat session, and prompt are required."
        : "A valid chat session and prompt are required.",
    },
  });
}

function uniqueDesignations(designations: readonly string[]): string[] {
  return [...new Set(designations.map((designation) => designation.trim()).filter(Boolean))];
}

type AiDependencies = {
  repository: ChatRepository;
  detectLanguage: (text: string, requestedLanguage: SupportedLanguage) => SupportedLanguage;
  generateResponse: (
    text: string,
    module: ChatModule,
    language: SupportedLanguage,
    additionalSystemPolicy?: string,
  ) => Promise<string>;
  lookupStandards?: StandardsLookup;
};

export function createAiRouter(
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
  dependencies: AiDependencies,
): Router {
  const router = Router();

  async function handle(
    request: import("express").Request,
    response: import("express").Response,
    moduleName: ChatModule,
    xpAmount: 10 | 15,
    input: AiRequest,
  ) {
    const { text, lang, session_id: sessionId } = input;

    let requestId: string;
    try {
      requestId = createIdempotencyKey(request.header("idempotency-key"), `ai:${moduleName}`);
    } catch {
      response.status(400).json({
        error: { code: "invalid_idempotency_key", message: "Idempotency-Key is invalid." },
      });
      return;
    }

    try {
      const { userId, accessToken } = response.locals.auth;
      const started = await dependencies.repository.beginExchange(
        userId,
        accessToken,
        sessionId,
        requestId,
        text,
        moduleName,
      );
      const canonicalPrompt = started.userMessage.text;
      const detectedLanguage = dependencies.detectLanguage(canonicalPrompt, lang);

      if (started.assistantMessage) {
        response.json({
          status: "ok",
          response: started.assistantMessage.text,
          user_message: started.userMessage,
          assistant_message: started.assistantMessage,
          ...started.progress,
          lang: detectedLanguage,
          idempotent_replay: true,
        });
        return;
      }

      const prepared = await preparePromptWithStandardsMetadata(canonicalPrompt, dependencies.lookupStandards);
      let providerFailureCategory: string | undefined;
      let providerStatus: number | undefined;
      let generatedResponse: string;
      try {
        generatedResponse = await dependencies.generateResponse(
          prepared.prompt,
          moduleName,
          detectedLanguage,
          prepared.systemInstructions,
        );
      } catch (error) {
        if (!(error instanceof AiProviderError)) throw error;
        providerFailureCategory = error.category;
        providerStatus = error.providerStatus;
        generatedResponse = error.fallbackContent;
      }
      const sanitizedResponse = sanitizeAssistantContent(generatedResponse);
      const firstGuardResult = guardStandardsResponse({
        content: sanitizedResponse,
        userPrompt: canonicalPrompt,
        lookupResult: prepared.lookupResult,
        language: detectedLanguage,
      });
      let finalGuardResult = firstGuardResult;
      let regenerationAttempted = false;
      let regenerationAccepted = false;
      let deterministicFallbackUsed = false;
      let deterministicFallbackCandidateCount = 0;
      const rejectedDesignations = [...(firstGuardResult.rejectedDesignations ?? [])];

      if (firstGuardResult.rejected && (firstGuardResult.unverifiedDesignations?.length ?? 0) > 0) {
        regenerationAttempted = true;
        const verifiedDesignations = verifiedStandardDesignations(prepared.lookupResult);
        const userProvidedDesignations = extractStandardIdentifiers(canonicalPrompt).map(({ raw }) => raw);
        const allowedDesignations = uniqueDesignations([...verifiedDesignations, ...userProvidedDesignations]);
        const strictPolicy = buildStrictStandardsAllowlistPolicy(allowedDesignations);
        const retrySystemPolicy = [prepared.systemInstructions, strictPolicy].filter(Boolean).join("\n\n");
        try {
          const regeneratedResponse = await dependencies.generateResponse(
            prepared.prompt,
            moduleName,
            detectedLanguage,
            retrySystemPolicy,
          );
          finalGuardResult = guardStandardsResponse({
            content: sanitizeAssistantContent(regeneratedResponse),
            userPrompt: canonicalPrompt,
            lookupResult: prepared.lookupResult,
            language: detectedLanguage,
          });
          regenerationAccepted = !finalGuardResult.rejected;
          rejectedDesignations.push(...(finalGuardResult.rejectedDesignations ?? []));
        } catch (error) {
          if (!(error instanceof AiProviderError)) throw error;
          providerFailureCategory = error.category;
          providerStatus = error.providerStatus;
        }
      }

      let responseText = finalGuardResult.content;
      if (finalGuardResult.rejected || providerFailureCategory !== undefined) {
        const deterministicResponse = buildVerifiedStandardsResponse(prepared.lookupResult, detectedLanguage);
        if (deterministicResponse) {
          responseText = deterministicResponse;
          deterministicFallbackUsed = true;
          deterministicFallbackCandidateCount = Math.min(
            verifiedStandardDesignations(prepared.lookupResult).length,
            3,
          );
        }
      }

      if (firstGuardResult.rejected) {
        console.warn("KazStandard response guard rejection", JSON.stringify({
          verifiedDesignations: verifiedStandardDesignations(prepared.lookupResult),
          rejectedDesignations: uniqueDesignations(rejectedDesignations),
          regenerationAttempted,
          regenerationAccepted,
          deterministicFallbackUsed,
          deterministicFallbackCandidateCount,
          ...(providerFailureCategory ? { providerFailureCategory } : {}),
          ...(providerStatus !== undefined ? { providerStatus } : {}),
        }));
      }

      if (!responseText) throw new Error("AI response did not contain user-facing content.");
      const completed = await dependencies.repository.completeExchange(
        userId,
        accessToken,
        sessionId,
        requestId,
        responseText,
        moduleName,
        xpAmount,
      );

      response.json({
        status: "ok",
        response: completed.assistantMessage?.text ?? responseText,
        user_message: completed.userMessage,
        assistant_message: completed.assistantMessage,
        ...completed.progress,
        lang: detectedLanguage,
        idempotent_replay: completed.awarded === false,
      });
    } catch (error) {
      if (error instanceof PersistenceError) {
        sendPersistenceError(response, error);
        return;
      }
      response.status(503).json({
        error: { code: "ai_unavailable", message: "The AI service is temporarily unavailable." },
      });
    }
  }

  router.post("/api/ai", authenticate, rateLimiter, safeAsync(async (request, response) => {
    const parsed = baseAiRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      sendInvalidAiRequest(response);
      return;
    }
    await handle(request, response, "tutor", 10, parsed.data);
  }));

  router.post("/api/module", authenticate, rateLimiter, safeAsync(async (request, response) => {
    const parsed = moduleAiRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      sendInvalidAiRequest(response, true);
      return;
    }
    await handle(request, response, parsed.data.module, 15, parsed.data);
  }));

  return router;
}
