import { buildSystemPrompt, languageName, type AiModule, type SupportedLanguage } from "./languagePolicy";
import { sanitizeAssistantContent } from "./responseSafety";
import { securityLogger } from "../security/structuredLogger";
import { beginGroqUsageAttempt } from "./usageDiagnostics";
import { stagingAiLimitsEnabled, withinAiDeadline } from "./stagingUsageLimits";

const FALLBACK_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const VISION_CAPABLE_MODELS = new Set(["qwen/qwen3.8-27b"]);
const MODEL_FALLBACK_STATUSES = new Set([400, 404]);
const CREDENTIAL_FALLBACK_STATUSES = new Set([401, 403]);
const RATE_LIMIT_BACKOFF_BASE_MS = 500;
const RATE_LIMIT_BACKOFF_JITTER_MS = 250;
const MAX_RATE_LIMIT_WAIT_MS = 5_000;
const MAX_SAFE_RETRY_AFTER_SECONDS = 300;

export type AiProviderFailureCategory = "aborted" | "authentication" | "invalid_response" | "model" | "network" | "provider" | "rate_limit" | "timeout" | "vision_unavailable";

export type AiVisionImage = {
  id: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  buffer: Buffer;
};

export class AiProviderError extends Error {
  constructor(
    readonly category: AiProviderFailureCategory,
    readonly fallbackContent: string,
    readonly providerStatus?: number,
    readonly retryAfterSeconds?: number,
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
  timeoutMs?: number;
  /** Test seam; production uses an abortable timer. */
  retryDelay?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const deltaSeconds = /^\d+(?:\.\d+)?$/u.test(trimmed) ? Number(trimmed) : undefined;
  const seconds = deltaSeconds !== undefined
    ? deltaSeconds
    : (Date.parse(trimmed) - now) / 1_000;
  if (!Number.isFinite(seconds)) return undefined;
  return Math.min(MAX_SAFE_RETRY_AFTER_SECONDS, Math.max(1, Math.ceil(seconds)));
}

function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, delayMs);
    function done() {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

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
  const delay = options.retryDelay ?? abortableDelay;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;

  return async function generateResponse(
    prompt: string,
    module: AiModule = "tutor",
    language: SupportedLanguage = "ru",
    additionalSystemPolicy?: string,
    images: readonly AiVisionImage[] = [],
    signal?: AbortSignal,
  ): Promise<string> {
    if (apiKeys.length === 0) return fallbackResponse(prompt, language, true);

    const systemPrompt = buildSystemPrompt(language, module, additionalSystemPolicy);
    const hasImages = images.length > 0;
    if (hasImages && !VISION_CAPABLE_MODELS.has(options.model)) {
      throw new AiProviderError("vision_unavailable", fallbackResponse(prompt, language, false));
    }
    const requestModels = hasImages ? [options.model] : modelCandidates;
    const boundedStagingRequest = module === "tutor" && stagingAiLimitsEnabled();
    let lastRetryAfterSeconds: number | undefined;
    const userContent = hasImages
      ? [
        { type: "text", text: `${prompt}\n\nRespond in ${languageName(language)}. Preserve technical notation and identifiers.` },
        ...images.map((image) => ({
          type: "image_url",
          image_url: { url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}` },
        })),
      ]
      : `${prompt}\n\nRespond in ${languageName(language)}. Preserve technical notation and identifiers.`;

    for (let keyAttempt = 0; keyAttempt < apiKeys.length; keyAttempt += 1) {
      const apiKey = apiKeys[keyAttempt];

      for (let modelAttempt = 0; modelAttempt < requestModels.length; modelAttempt += 1) {
        const model = requestModels[modelAttempt];
        const finishUsage = beginGroqUsageAttempt();
        let usage: unknown;
        try {
        securityLogger.info("ai_provider_request", {
          provider: "groq",
          model,
          language,
          credential_slot: keyAttempt === 0 ? "primary" : "secondary",
          credential_attempt: keyAttempt + 1,
          credential_attempt_limit: apiKeys.length,
          model_attempt: modelAttempt + 1,
          model_attempt_limit: requestModels.length,
          vision_image_count: images.length,
        });

        let response: Response;
        let stagingBody: { usage?: unknown; choices?: Array<{ message?: { content?: string } }> } | undefined;
        const providerAbort = new AbortController();
        let timedOut = false;
        const abortProvider = () => providerAbort.abort();
        signal?.addEventListener("abort", abortProvider, { once: true });
        if (boundedStagingRequest && signal?.aborted) providerAbort.abort(signal.reason);
        const timeout = setTimeout(() => {
          timedOut = true;
          providerAbort.abort();
        }, options.timeoutMs ?? 45_000);
        try {
          const fetchResponse = () => fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
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
                  content: userContent,
                },
              ],
              temperature: 0.2,
              max_tokens: 1600,
              reasoning_effort: model.startsWith("openai/gpt-oss-") ? "medium" : "none",
            }),
            signal: providerAbort.signal,
          });
          response = boundedStagingRequest
            ? await withinAiDeadline(providerAbort.signal, fetchResponse) : await fetchResponse();
          if (boundedStagingRequest && response.ok) {
            // Keep cancellation and the attempt timeout active through body consumption.
            stagingBody = await withinAiDeadline(providerAbort.signal, () => response.json());
            usage = stagingBody?.usage;
          } else if (boundedStagingRequest) {
            await withinAiDeadline(providerAbort.signal, async () => { await response.body?.cancel(); });
          }
        } catch {
          const category: AiProviderFailureCategory = signal?.aborted
            ? "aborted"
            : timedOut
              ? "timeout"
              : "network";
          securityLogger.error("ai_provider_failure", {
            provider: "groq",
            model,
            error_category: category,
          });
          throw new AiProviderError(category, fallbackResponse(prompt, language, false));
        } finally {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", abortProvider);
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

          if (response.status === 429) {
            const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"), now());
            const fallbackDelayMs = RATE_LIMIT_BACKOFF_BASE_MS * (2 ** keyAttempt)
              + Math.floor(random() * RATE_LIMIT_BACKOFF_JITTER_MS);
            const retryDelayMs = retryAfterSeconds === undefined ? fallbackDelayMs : retryAfterSeconds * 1_000;
            const safeRetryAfterSeconds = retryAfterSeconds ?? lastRetryAfterSeconds
              ?? Math.max(1, Math.ceil(retryDelayMs / 1_000));
            lastRetryAfterSeconds = safeRetryAfterSeconds;
            if (keyAttempt >= apiKeys.length - 1) {
              throw new AiProviderError(category, fallbackResponse(prompt, language, false), response.status,
                safeRetryAfterSeconds);
            }
            if (retryDelayMs > MAX_RATE_LIMIT_WAIT_MS) {
              throw new AiProviderError(category, fallbackResponse(prompt, language, false), response.status,
                safeRetryAfterSeconds);
            }
            securityLogger.info("ai_provider_retry_scheduled", {
              provider: "groq",
              error_category: category,
              credential_attempt: keyAttempt + 1,
              next_credential_attempt: keyAttempt + 2,
              retry_delay_ms: retryDelayMs,
            });
            try {
              await delay(retryDelayMs, signal);
            } catch {
              if (signal?.reason?.name !== "TimeoutError") {
                throw new AiProviderError("aborted", fallbackResponse(prompt, language, false));
              }
              throw new AiProviderError(category, fallbackResponse(prompt, language, false), response.status,
                safeRetryAfterSeconds);
            }
            break;
          }
          if (CREDENTIAL_FALLBACK_STATUSES.has(response.status) && keyAttempt < apiKeys.length - 1) break;
          if (modelAttempt < requestModels.length - 1 && MODEL_FALLBACK_STATUSES.has(response.status)) continue;
          throw new AiProviderError(category, fallbackResponse(prompt, language, false), response.status);
        }

        try {
          const data = (boundedStagingRequest ? stagingBody : await response.json()) as { usage?: unknown; choices?: Array<{ message?: { content?: string } }> };
          usage = data.usage;
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
        } finally {
          finishUsage(usage);
        }
      }
    }

    throw new AiProviderError("provider", fallbackResponse(prompt, language, false));
  };
}
