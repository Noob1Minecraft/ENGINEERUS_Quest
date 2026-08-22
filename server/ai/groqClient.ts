import { buildSystemPrompt, languageName, type AiModule, type SupportedLanguage } from "./languagePolicy";
import { sanitizeAssistantContent } from "./responseSafety";

const FALLBACK_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const MODEL_FALLBACK_STATUSES = new Set([400, 404]);
const CREDENTIAL_FALLBACK_STATUSES = new Set([401, 403]);

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
        console.log(
          `Sending request to Groq API (${model}) | language=${language} | credential=${keyAttempt === 0 ? "primary" : "secondary"} | attempt=${modelAttempt + 1}/${modelCandidates.length}`,
        );

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
        } catch (error) {
          console.error(`Groq network error [model=${model}]:`, error instanceof Error ? error.message : "Unknown error");
          return fallbackResponse(prompt, language, false);
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
          console.error(`Groq API error [model=${model}, status=${response.status}]:`, errorData.error?.message ?? "Unknown Groq error");

          if (CREDENTIAL_FALLBACK_STATUSES.has(response.status)) break;
          if (modelAttempt < modelCandidates.length - 1 && MODEL_FALLBACK_STATUSES.has(response.status)) continue;
          return fallbackResponse(prompt, language, false);
        }

        try {
          const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
          const content = sanitizeAssistantContent(data.choices?.[0]?.message?.content ?? "");
          if (content) return content;
          console.error(`Groq returned an empty response [model=${model}].`);
        } catch (error) {
          console.error(`Groq returned malformed JSON [model=${model}]:`, error instanceof Error ? error.message : "Unknown error");
        }
        return fallbackResponse(prompt, language, false);
      }
    }

    return fallbackResponse(prompt, language, false);
  };
}
