import { z } from "zod";

import {
  buildEngineeringDomainPolicy,
  buildEngineeringIntentPolicy,
  classifyEngineeringDomain,
  classifyEngineeringIntent,
  engineeringOffTopicRedirect,
} from "../../server/ai/engineeringPolicy";
import type { SupportedLanguage } from "../../server/ai/languagePolicy";
import { existingTutorKnowledge } from "../../server/ai/tutor/knowledge";
import type { createTutorPipeline } from "../../server/ai/tutor/pipeline";
import { planTutoring } from "../../server/ai/tutor/taskRouter";

export const giveHintInputSchema = z.object({
  problem: z.string().trim().min(1).max(20_000),
  language: z.enum(["en", "ru", "kk"]),
}).strict();

type TutorPipeline = ReturnType<typeof createTutorPipeline>;

type GiveHintResult = {
  content: [{ type: "text"; text: string }];
  isError?: true;
};

const FAILURE: Record<SupportedLanguage, string> = {
  en: "Unable to generate a hint right now. Please try again later.",
  ru: "Сейчас не удалось сформировать подсказку. Попробуйте позже.",
  kk: "Қазір кеңес құру мүмкін болмады. Кейінірек қайталап көріңіз.",
};

function textResult(text: string, isError = false): GiveHintResult {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true as const } : {}),
  };
}

export function createGiveHintHandler(tutorPipeline: TutorPipeline) {
  return async (input: unknown, signal?: AbortSignal): Promise<GiveHintResult> => {
    const parsed = giveHintInputSchema.safeParse(input);
    if (!parsed.success) return textResult("Invalid give_hint input.", true);

    const { problem, language } = parsed.data;
    const domainInput = { text: problem, module: "tutor" as const };
    const domain = classifyEngineeringDomain(domainInput);
    if (domain === "OUT_OF_SCOPE") return textResult(engineeringOffTopicRedirect(language));

    const intent = classifyEngineeringIntent(domainInput);
    const policy = [buildEngineeringDomainPolicy(domain), buildEngineeringIntentPolicy(intent)].join("\n\n");

    try {
      const hint = await tutorPipeline({
        plan: planTutoring(problem, [], "hint"),
        knowledge: existingTutorKnowledge({ prompt: problem, policy, sources: [] }),
        language,
        originalTask: problem,
        signal,
      });
      return textResult(hint);
    } catch {
      return textResult(FAILURE[language], true);
    }
  };
}
