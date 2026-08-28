import type { SupportedLanguage } from "../ai/languagePolicy";
import type { StandardsLookupResult, VerifiedStandard } from "./standardsService";

const STANDARD_IDENTIFIER = /(?:ГОСТ(?:\s+(?:РК|ISO(?:\/IEC)?|IEC|EN))?|СТ\s+РК(?:\s+(?:ISO(?:\/IEC)?|IEC|EN))?|ҚР\s+СТ|ЕСКД|СП\s+РК|СНиП(?:\s+РК)?|СН\s+РК|ТР\s+(?:ЕАЭС|ТС)|GOST(?:\s+(?:RK|ISO(?:\/IEC)?|IEC|EN))?|ST\s+RK(?:\s+(?:ISO(?:\/IEC)?|IEC|EN))?|ESKD|SP\s+RK|SNIP(?:\s+RK)?|SN\s+RK|TR\s+EAEU|ISO(?:\/IEC)?|IEC)\s+\d+(?:\s*[./:–—-]\s*\d+)*/giu;
const CURRENT_CLAIM = /(?:действующ\p{L}*|действует|актуальн\p{L}*|подтвержд[её]н\p{L}*|current|valid|verified|in force|қолданыста|өзекті|расталған)/iu;
const NEGATED_CURRENT_CLAIM = /(?:не\s+(?:является\s+)?(?:действующ|актуальн|подтвержд)|не\s+удалось\s+подтверд|not\s+(?:current|valid|verified)|cannot\s+be\s+(?:verified|confirmed)|could\s+not\s+(?:verify|confirm)|расталма|емес)/iu;
const NO_RESULT_DISCLOSURE = /(?:не\s+удалось\s+(?:подтвердить|найти)|не\s+(?:подтвержд[её]н|найден)[^.!?]{0,100}(?:каталог|КазСтандарт)|could\s+not\s+(?:verify|confirm|find)|no\s+(?:specific\s+)?(?:current\s+)?standard\s+was\s+(?:verified|found)|(?:растау|табу)\s+мүмкін\s+болмады|расталмады|табылмады)/iu;
const DOCUMENTATION_CONTEXT = /(?:конструкторск|черт[её]ж|техническ\p{L}*\s+документац|design\s+documentation|engineering\s+drawing|technical\s+documentation|конструкторлық|сызба|техникалық\s+құжат)/iu;

type IdentifierMatch = {
  raw: string;
  normalized: string;
  index: number;
};

export type StandardsGuardResult = {
  content: string;
  rejected: boolean;
  rejectedDesignations?: string[];
  unverifiedDesignations?: string[];
};

function normalizeIdentifier(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleUpperCase("und")
    .replace(/[–—]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/\s*([./:-])\s*/gu, "$1")
    .trim();
}

export function extractStandardIdentifiers(text: string): IdentifierMatch[] {
  return [...text.matchAll(STANDARD_IDENTIFIER)].map((match) => ({
    raw: match[0],
    normalized: normalizeIdentifier(match[0]),
    index: match.index ?? 0,
  }));
}

function verifiedStandards(result: StandardsLookupResult): VerifiedStandard[] {
  if (result.kind === "verified") return [result.standard];
  if (result.kind === "ambiguous") return result.candidates;
  return [];
}

export function verifiedStandardDesignations(result: StandardsLookupResult | undefined): string[] {
  return result ? verifiedStandards(result).map(({ designation }) => designation) : [];
}

function uniqueMatches(matches: readonly IdentifierMatch[]): string[] {
  return [...new Map(matches.map(({ normalized, raw }) => [normalized, raw])).values()];
}

function makesUnsupportedCurrentClaim(
  content: string,
  match: IdentifierMatch,
  userProvided: Set<string>,
  verifiedByDesignation: Map<string, VerifiedStandard>,
): boolean {
  const verified = verifiedByDesignation.get(match.normalized);
  const requiresQualification = userProvided.has(match.normalized)
    ? !verified
    : verified?.currency === "non_current";
  if (!requiresQualification) return false;

  const window = content.slice(Math.max(0, match.index - 80), match.index + match.raw.length + 120);
  return CURRENT_CLAIM.test(window) && !NEGATED_CURRENT_CLAIM.test(window);
}

export function standardsGuardFallback(language: SupportedLanguage, partialVerification = false): string {
  if (language === "kk") {
    return partialVerification
      ? "ҚазСтандарттың ашық каталогы дайындалған жауаптағы барлық нақты стандарт нөмірлерін растамады. Мен расталмаған нөмірлерді келтірмей, жалпы инженерлік түсіндірме бере аламын."
      : "ҚазСтандарттың ашық каталогынан бұл сұрауға сәйкес нақты қолданыстағы стандартты растау мүмкін болмады. Мен жалпы инженерлік түсіндірме бере аламын, бірақ стандарт нөмірін ойдан шығармаймын.";
  }
  if (language === "en") {
    return partialVerification
      ? "The public KazStandard catalog did not verify every specific standard identifier in the prepared answer. I can provide general engineering guidance without including unverified identifiers."
      : "The public KazStandard catalog did not verify a specific current standard for this request. I can provide a general engineering explanation, but I will not invent a standard identifier.";
  }
  return partialVerification
    ? "По открытому каталогу КазСтандарта не удалось подтвердить все конкретные стандарты, упомянутые в подготовленном ответе. Я могу дать общее инженерное объяснение без неподтверждённых номеров."
    : "По открытому каталогу КазСтандарта не удалось подтвердить конкретный действующий стандарт для этого запроса. Я могу дать общее инженерное объяснение, но не буду придумывать номер стандарта.";
}

function noResultLimitation(language: SupportedLanguage): string {
  if (language === "kk") {
    return "ҚазСтандарттың ашық каталогынан бұл сұрауға сәйкес нақты қолданыстағы стандартты растау мүмкін болмады.";
  }
  if (language === "en") {
    return "The public KazStandard catalog did not verify a specific current standard for this request.";
  }
  return "По открытому каталогу КазСтандарта не удалось подтвердить конкретный действующий стандарт для этого запроса.";
}

function noResultGuidanceFallback(language: SupportedLanguage, userPrompt: string): string {
  const documentationContext = DOCUMENTATION_CONTEXT.test(userPrompt);
  if (language === "kk") {
    const guidance = documentationContext
      ? "Жалпы жағдайда конструкторлық құжаттаманы рәсімдеу ЕСКД қағидаттарымен және сызбаларға, форматтарға, белгілеулерге әрі құжаттар құрамына қойылатын талаптармен байланысты. Нақты қолданыстағы белгілеуді ҚазСтандарттың ресми каталогынан тексерген дұрыс."
      : "Мен расталмаған нөмірлерді келтірмей, жалпы инженерлік қағидаттарды, қолданылатын стандарттар топтарын және тексеру өлшемдерін түсіндіре аламын. Нақты қолданыстағы белгілеуді ресми каталогтан тексерген дұрыс.";
    return `${noResultLimitation(language)} ${guidance}`;
  }
  if (language === "en") {
    const guidance = documentationContext
      ? "In general, engineering-documentation preparation is associated with ESKD principles and requirements for drawings, formats, designations, and document composition. The exact current designation should be checked in the official KazStandard catalog."
      : "I can still explain the general engineering principles, relevant standards families, and verification criteria without introducing unverified identifiers. The exact current designation should be checked in the official catalog.";
    return `${noResultLimitation(language)} ${guidance}`;
  }
  const guidance = documentationContext
    ? "В общем случае оформление конструкторской документации связано с требованиями ЕСКД к чертежам, форматам, обозначениям и составу документов. Конкретное действующее обозначение лучше проверить в официальном каталоге КазСтандарта."
    : "Я могу дать общее инженерное объяснение, описать применимые семейства стандартов и критерии проверки без неподтверждённых номеров. Конкретное действующее обозначение лучше проверить в официальном каталоге.";
  return `${noResultLimitation(language)} ${guidance}`;
}

function unverifiedWithoutLookupFallback(language: SupportedLanguage): string {
  if (language === "kk") {
    return "Бұл жауаптағы нақты стандарт нөмірлерін ресми дереккөзден тексеру мүмкін болмады. Мен оларды расталған деп көрсетпеймін және нөмірсіз жалпы инженерлік түсіндірме бере аламын.";
  }
  if (language === "en") {
    return "The specific standard identifiers in this answer could not be checked against an official source. I will not present them as verified, but I can provide general engineering guidance without numbered standards.";
  }
  return "Конкретные номера стандартов в этом ответе не удалось проверить по официальному источнику. Я не буду представлять их как подтверждённые, но могу дать общее инженерное объяснение без номеров стандартов.";
}

function ensureNoResultLimitation(content: string, language: SupportedLanguage): string {
  if (NO_RESULT_DISCLOSURE.test(content)) return content;
  return `${noResultLimitation(language)}\n\n${content}`;
}

export function guardStandardsResponse(options: {
  content: string;
  userPrompt: string;
  lookupResult?: StandardsLookupResult;
  language: SupportedLanguage;
}): StandardsGuardResult {
  const { content, userPrompt, lookupResult, language } = options;
  const userProvided = new Set(extractStandardIdentifiers(userPrompt).map(({ normalized }) => normalized));
  if (!lookupResult) {
    const introducedMatches = extractStandardIdentifiers(content).filter(({ normalized }) => !userProvided.has(normalized));
    if (introducedMatches.length === 0) return { content, rejected: false };
    return {
      content: unverifiedWithoutLookupFallback(language),
      rejected: true,
      rejectedDesignations: uniqueMatches(introducedMatches),
      unverifiedDesignations: uniqueMatches(introducedMatches),
    };
  }
  const verified = verifiedStandards(lookupResult);
  const verifiedByDesignation = new Map(
    verified.map((standard) => [normalizeIdentifier(standard.designation), standard]),
  );
  const allowed = new Set([...userProvided, ...verifiedByDesignation.keys()]);
  const assistantIdentifiers = extractStandardIdentifiers(content);
  const unverifiedMatches = assistantIdentifiers.filter(({ normalized }) => !allowed.has(normalized));
  const unsupportedCurrentMatches = assistantIdentifiers.filter((match) => (
    makesUnsupportedCurrentClaim(content, match, userProvided, verifiedByDesignation)
  ));
  const introducedUnverified = unverifiedMatches.length > 0;
  const unsupportedCurrentClaim = unsupportedCurrentMatches.length > 0;

  if (!introducedUnverified && !unsupportedCurrentClaim) {
    return {
      content: lookupResult.kind === "no_result"
        ? ensureNoResultLimitation(content, language)
        : content,
      rejected: false,
    };
  }

  const partialVerification = verified.length > 0;
  return {
    content: lookupResult.kind === "no_result"
      ? noResultGuidanceFallback(language, userPrompt)
      : lookupResult.kind === "disabled"
        ? unverifiedWithoutLookupFallback(language)
        : standardsGuardFallback(language, partialVerification),
    rejected: true,
    rejectedDesignations: uniqueMatches([...unverifiedMatches, ...unsupportedCurrentMatches]),
    unverifiedDesignations: uniqueMatches(unverifiedMatches),
  };
}
