import { buildSystemPrompt, languageName, type AiModule, type SupportedLanguage } from "./languagePolicy";
import { sanitizeAssistantContent } from "./responseSafety";
import { securityLogger } from "../security/structuredLogger";

const FALLBACK_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const MODEL_FALLBACK_STATUSES = new Set([400, 404]);
const CREDENTIAL_FALLBACK_STATUSES = new Set([401, 403]);

export type AiProviderFailureCategory = "authentication" | "invalid_response" | "model" | "network" | "provider" | "rate_limit";

export class AiProviderError extends Error {
  constructor(
    readonly category: AiProviderFailureCategory,
    readonly fallbackContent: string,
    readonly providerStatus?: number,
  ) {
    super(`AI provider failure: ${category}`);
    this.name = "AiProviderError";
  }
}

type Fetch = typeof fetch;

type GroqResponderOptions = {
  apiKey?: string;
  secondaryApiKey?: string;
  model: string;
  fetchImpl?: Fetch;
};

function fallbackResponse(prompt: string, language: "ru" | "kk" | "en", demoMode: boolean): string {
  const excerpt = prompt.trim().slice(0, 50);
  if (language === "kk") {
    return demoMode
      ? ` **Engineerus AI (Демо режим)**\n\nСұрау: "${excerpt}..."\n\n• Талдау: Демо жауап. Есептеулерді тексеріңіз.`
      : ` **Engineerus AI**\n\nСұрау: "${excerpt}..."\n\n• ЖИ жауабын алу мүмкін болмады. Қайталап көріңіз.`;
  }
  if (language === "en") {
    return demoMode
      ? ` **Engineerus AI (Demo Mode)**\n\nRequest: "${excerpt}..."\n\n• Analysis: Demo response. Verify the calculations.`
      : ` **Engineerus AI**\n\nRequest: "${excerpt}..."\n\n• The AI response could not be generated. Please try again.`;
  }
  return demoMode
    ? ` **Engineerus AI (Демо-режим)**\n\nЗапрос: "${excerpt}..."\n\n• Анализ: Демо-ответ. Проверьте расчёты.`
    : ` **Engineerus AI**\n\nЗапрос: "${excerpt}..."\n\n• Не удалось получить ответ от ИИ. Повторите попытку.`;
}

export function createGroqResponder(options: GroqResponderOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKeys = [...new Set([options.apiKey, options.secondaryApiKey].filter((key): key is string => Boolean(key)))];
  const modelCandidates = [...new Set([options.model, ...FALLBACK_MODELS])];

  return async function generateResponse(
    prompt: string,
    module: AiModule = "tutor",
    language: SupportedLanguage = "ru",
    additionalSystemPolicy?: string,
  ): Promise<string> {
    if (apiKeys.length === 0) return fallbackResponse(prompt, language, true);

    const systemPrompt = buildSystemPrompt(language, module, additionalSystemPolicy);

    for (let keyAttempt = 0; keyAttempt < apiKeys.length; keyAttempt += 1) {
      const apiKey = apiKeys[keyAttempt];

      for (let modelAttempt = 0; modelAttempt < modelCandidates.length; modelAttempt += 1) {
        const model = modelCandidates[modelAttempt];
        securityLogger.info("ai_provider_request", {
          provider: "groq",
          model,
          language,
          credential_slot: keyAttempt === 0 ? "primary" : "secondary",
          retry_attempt: modelAttempt + 1,
          retry_limit: modelCandidates.length,
        });

        let response: Response;
        try {
          response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: `${prompt}\n\nRespond in ${languageName(language)}. Preserve technical notation and identifiers.`,
                },
              ],
              temperature: 0.2,
              max_tokens: 600,
              reasoning_effort: "none",
            }),
          });
        } catch {
          securityLogger.error("ai_provider_failure", {
            provider: "groq",
            model,
            error_category: "network",
          });
          throw new AiProviderError("network", fallbackResponse(prompt, language, false));
        }

        if (!response.ok) {
          const category: AiProviderFailureCategory = response.status === 429
            ? "rate_limit"
            : CREDENTIAL_FALLBACK_STATUSES.has(response.status)
              ? "authentication"
              : MODEL_FALLBACK_STATUSES.has(response.status)
                ? "model"
                : "provider";
          securityLogger.error("ai_provider_failure", {
            provider: "groq",
            model,
            status: response.status,
            error_category: category,
          });

          if ((CREDENTIAL_FALLBACK_STATUSES.has(response.status) || response.status === 429)
              && keyAttempt < apiKeys.length - 1) break;
          if (modelAttempt < modelCandidates.length - 1 && MODEL_FALLBACK_STATUSES.has(response.status)) continue;
          throw new AiProviderError(category, fallbackResponse(prompt, language, false), response.status);
        }

        try {
          const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
          const content = sanitizeAssistantContent(data.choices?.[0]?.message?.content ?? "");
          if (content) return content;
          securityLogger.error("ai_provider_failure", {
            provider: "groq",
            model,
            error_category: "empty_response",
          });
        } catch (error) {
          if (error instanceof AiProviderError) throw error;
          securityLogger.error("ai_provider_failure", {
            provider: "groq",
            model,
            error_category: "malformed_response",
          });
        }
        throw new AiProviderError("invalid_response", fallbackResponse(prompt, language, false));
      }
    }

    throw new AiProviderError("provider", fallbackResponse(prompt, language, false));
  };
}
