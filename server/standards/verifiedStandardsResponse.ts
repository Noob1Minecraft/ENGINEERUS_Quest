import type { SupportedLanguage } from "../ai/languagePolicy";
import type { StandardsLookupResult, VerifiedStandard } from "./standardsService";

const MAX_STANDARDS = 3;

function verifiedStandards(result: StandardsLookupResult): VerifiedStandard[] {
  if (result.kind === "verified") return [result.standard];
  if (result.kind === "ambiguous") return result.candidates;
  return [];
}

function formatStandard(
  standard: VerifiedStandard,
  labels: { status: string; effectiveDate: string; source: string },
): string {
  const lines = [`- ${standard.designation} — ${standard.title}`];
  if (standard.status) lines.push(`  ${labels.status}: ${standard.status}`);
  if (standard.effectiveDate) lines.push(`  ${labels.effectiveDate}: ${standard.effectiveDate}`);
  if (standard.sourceUrl) lines.push(`  ${labels.source}: ${standard.sourceUrl}`);
  return lines.join("\n");
}

export function buildVerifiedStandardsResponse(
  result: StandardsLookupResult,
  language: SupportedLanguage,
): string | undefined {
  const standards = verifiedStandards(result).slice(0, MAX_STANDARDS);
  if (standards.length === 0) return undefined;

  if (language === "kk") {
    const records = standards.map((standard) => formatStandard(standard, {
      status: "Мәртебесі",
      effectiveDate: "Қолданысқа енгізілген күні",
      source: "Дереккөз",
    })).join("\n\n");
    return `ҚазСтандарттың ашық каталогынан мына релевантты құжаттар расталды:\n\n${records}\n\nБұл нәтижелер каталогтың ашық метадеректері бойынша тексерілді. Стандарттардың толық мәтіні талданған жоқ, сондықтан нақты талаптар мен жобаға қолданылуын ресми құжаттан тексеру қажет.`;
  }

  if (language === "en") {
    const records = standards.map((standard) => formatStandard(standard, {
      status: "Status",
      effectiveDate: "Effective date",
      source: "Source",
    })).join("\n\n");
    return `The following relevant documents were verified in the public KazStandard catalog:\n\n${records}\n\nThese results were checked against public catalog metadata only. The full standards were not analyzed, so their specific requirements and applicability to the project must be verified in the official documents.`;
  }

  const records = standards.map((standard) => formatStandard(standard, {
    status: "Статус",
    effectiveDate: "Дата введения в действие",
    source: "Источник",
  })).join("\n\n");
  return `По открытому каталогу КазСтандарта удалось подтвердить следующие релевантные документы:\n\n${records}\n\nЭти результаты проверены только по открытым метаданным каталога. Полный текст стандартов не анализировался, поэтому конкретные требования и применимость к проекту необходимо проверять в официальных документах.`;
}
