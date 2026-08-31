import type { SupportedLanguage } from "./languagePolicy";

export type MaterialPropertyGuardResult = {
  content: string;
  replaced: boolean;
};

const EXACT = /(?:\bexact\b|\bprecise\b|точн\p{L}*|нақты)/iu;
const MATERIAL_PROPERTY = /(?:yield\s+strength|ultimate\s+strength|fatigue\s+strength|allowable\s+stress|hardness|thermal\s+conductivity|young'?s\s+modulus|предел\p{L}*\s+(?:текуч|прочност)|усталост\p{L}*\s+прочност|допускаем\p{L}*\s+напряж|твердост|теплопроводност|модул\p{L}*\s+юнг|аққыштық\s+шег|беріктік\s+шег|шаршау\p{L}*\s+берікт|рұқсат\p{L}*\s+кернеу|қаттыл|жылу\s+өткіз|серпімділік\s+модул)/iu;
const MATERIAL_PROPERTY_VALUE = /(?<![\p{L}\d])\d+(?:[.,]\d+)?\s*(?:MPa|GPa|Pa|ksi|HBW?|HV|HRC|W\/?m(?:·|\*)?K|Вт\/?м(?:·|\*)?К|МПа|ГПа|Па)(?![\p{L}\d])/giu;
const APPROXIMATE_EDUCATIONAL = /(?:approx(?:imate|imately)?|typical|educational|illustrative|ориентировоч|приблиз|учебн|иллюстратив|шамамен|жуық|оқу\p{L}*\s+(?:мысал|анықтама)|үлгі)/iu;
const NOT_FINAL_DESIGN = /(?:not\s+(?:suitable|intended|valid)\s+(?:as|for)\s+(?:final\s+)?(?:design|design data)|not\s+for\s+final\s+design|не\s+(?:предназначен|подходит|годится)\p{L}*\s+(?:для\s+)?(?:окончательн\p{L}*\s+)?(?:расч[её]т|проект)|не\s+для\s+(?:окончательн\p{L}*\s+)?(?:расч[её]т|проект)|(?:соңғы|қорытынды)\p{L}*\s+(?:жоба|есеп)\p{L}*\s+үшін\s+(?:жарамсыз|арналмаған))/iu;

const FALLBACKS: Record<SupportedLanguage, string> = {
  ru: "У стали нет одного точного предела текучести: он зависит от марки, состояния или термообработки и температуры. Укажите точную марку, состояние, температуру и авторитетный паспорт материала или стандарт; без этого я не буду приводить численное значение для окончательного расчёта.",
  kk: "Болат үшін бір ғана нақты аққыштық шегі жоқ: ол маркасына, күйіне не термиялық өңдеуіне және температураға тәуелді. Нақты марканы, күйін, температураны және беделді материал паспортын не стандартты көрсетіңіз; онсыз соңғы жоба есебі үшін сандық мән келтірмеймін.",
  en: "Steel has no single exact yield strength: it depends on grade, condition or heat treatment, and temperature. Provide the exact grade, condition, temperature, and an authoritative datasheet or standard; without them I will not provide a numeric value for final design.",
};

function normalizedValues(value: string): Set<string> {
  return new Set((value.match(MATERIAL_PROPERTY_VALUE) ?? [])
    .map((match) => match.toLowerCase().replace(/\s+/g, "").replace(",", ".")));
}

/**
 * Narrows post-generation enforcement to exact material-property requests.
 * It deliberately leaves calculations, user-supplied values, and ordinary
 * engineering quantities outside this guard's scope.
 */
export function guardMaterialPropertyResponse(input: {
  content: string;
  userPrompt: string;
  language: SupportedLanguage;
}): MaterialPropertyGuardResult {
  if (!EXACT.test(input.userPrompt) || !MATERIAL_PROPERTY.test(input.userPrompt)) {
    return { content: input.content, replaced: false };
  }

  const promptValues = normalizedValues(input.userPrompt);
  const responseValues = normalizedValues(input.content);
  const introducesNewPropertyValue = [...responseValues].some((value) => !promptValues.has(value));
  const hasBothQualifications = APPROXIMATE_EDUCATIONAL.test(input.content)
    && NOT_FINAL_DESIGN.test(input.content);

  if (!introducesNewPropertyValue || hasBothQualifications) {
    return { content: input.content, replaced: false };
  }

  return { content: FALLBACKS[input.language], replaced: true };
}
