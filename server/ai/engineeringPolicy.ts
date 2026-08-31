import type { AiModule, SupportedLanguage } from "./languagePolicy";
import { isStandardsLookupWarranted } from "../standards/standardsPolicy";

export type EngineeringIntent =
  | "ENGINEERING_CONCEPT"
  | "ENGINEERING_CALCULATION"
  | "ENGINEERING_DESIGN"
  | "ENGINEERING_TROUBLESHOOTING"
  | "ENGINEERING_PROGRAMMING"
  | "ENGINEERING_DOCUMENT"
  | "ENGINEERING_IMAGE"
  | "ENGINEERING_STANDARD"
  | "RELATED_STEM"
  | "OFF_TOPIC";

type IntentInput = {
  text: string;
  module: AiModule;
  hasDocument?: boolean;
  hasImages?: boolean;
};

const OFF_TOPIC = /(?:love\s+poem|relationship\s+advice|celebrity\s+gossip|world\s+cup|entertainment\s+trivia|roman\s+empire|political\s+persuasion|write\s+(?:me\s+)?a\s+poem|horoscope|movie\s+recap|travel\s+itinerary|cooking\s+recipe|стихотворен\p{L}*\s+(?:о\s+)?любв|совет\p{L}*\s+об\s+отношен|сплетн\p{L}*\s+о\s+знаменит|кто\s+выиграл\s+чемпионат\s+мира|римск\p{L}*\s+импери|политическ\p{L}*\s+агитац|гороскоп|пересказ\p{L}*\s+фильм|туристическ\p{L}*\s+маршрут|кулинарн\p{L}*\s+рецепт|махаббат\s+туралы\s+өлең|қарым-қатынас\s+туралы\s+кеңес|әлем\s+чемпионат\p{L}*\s+кім\s+жең|жұлдыз\s+жорамал|саяхат\s+жоспар|аспаздық\s+рецепт)/iu;
const FOLLOW_UP = /^(?:why|show\s+(?:the\s+)?formula|calculate\s+again|explain\s+(?:it\s+)?simpler|what\s+if\s+i\s+(?:double|halve)\s+it|use\s+\p{L}+\s+instead|почему|покажи\s+формул\p{L}*|рассчитай\s+(?:ещ[её]|снова)|объясни\s+проще|а\s+если\s+(?:удвоить|уменьшить)|используй\s+\p{L}+\s+вместо|неге|формуланы\s+көрсет|қайта\s+есепте|қарапайым\s+түсіндір|екі\s+есе\s+(?:арттырса|кемітсе))\s*[?.!]*$/iu;
const CALCULATION = /(?:calculate|compute|solve|find\s+(?:the\s+)?(?:stress|force|torque|power|current|voltage|diameter|deflection)|рассчитай|вычисли|найди\s+(?:напряжен|сил|момент|мощност|ток|напряжение|диаметр|прогиб)|есепте|табу|formula|формул|equation|уравнен|теңдеу|\d+(?:[.,]\d+)?\s*(?:kn|n·?m|nm|mpa|gpa|pa|kw|w|v|a|mm|cm|m\b|kg|кн|н·?м|мпа|гпа|квт|вт))/iu;
const TROUBLESHOOTING = /(?:not\s+working|fails?|failure|fault|overheat|noise|vibration|debug|diagnos|troubleshoot|не\s+работает|отказ|неисправ|перегрев|шум|вибрац|диагност|поиск\s+причин|жұмыс\s+істемейді|ақау|қызып|діріл|диагност)/iu;
const PROGRAMMING = /(?:python|matlab|simulink|rust|c\+\+|arduino|embedded|firmware|numerical\s+method|code|script|algorithm|программ|код|скрипт|алгоритм|численн\p{L}*\s+метод|бағдарлам|сандық\s+әдіс|cad\s+automation)/iu;
const DESIGN = /(?:design|select(?:ing)?\s+(?:a\s+)?(?:material|bearing|sensor|component|process)|choos(?:e|ing)\s+(?:a\s+)?(?:material|bearing|sensor|component|process)|compar(?:e|ing)\s+materials|which\s+material|what\s+material|sizing|dimensioning|trade-?offs?|failure\s+mode|проектир|конструир|подб(?:ор|ери)\s+(?:материал|подшипник|датчик|процесс)|выбор\s+(?:материал|подшипник|датчик|процесс)|сравн\p{L}*\s+материал|какой\s+материал|размер\p{L}*|компромисс|отказоустойчив|жобалау|материал\p{L}*\s+салыстыр|материал\s+таңдау|мойынтірек\s+таңдау|сенсор\s+таңдау|қандай\s+материал|өлшем|ымыра|cad|cae|manufactur)/iu;
const DOCUMENT = /(?:engineering\s+(?:document|drawing|report)|technical\s+(?:document|report)|drawing|specification|конструкторск\p{L}*\s+документац|техническ\p{L}*\s+(?:документац|отч[её]т)|черт[её]ж|спецификац|техникалық\s+(?:құжат|есеп)|конструкторлық\s+құжат|сызба)/iu;
const ENGINEERING = /(?:engineer|mechanic|mechatronic|electric|electronic|civil|structur|material|alloy|aluminum|manufactur|solid\s+mechanics|static|dynamic|strength|fatigue|friction|machine|thermodynamic|heat\s+(?:transfer|exchanger)|conduction|turbine|fluid|continuity|hydraulic|pneumatic|control\s+system|pid|robot|sensor|actuator|circuit|ohm|rc\s+time|power\s+system|cad|cae|stress|strain|beam|shaft|bearing|gear|torque|voltage|current|resistance|capacit|induct|weld|corrosion|tolerance|fit|load|pressure|flow|temperature|инженер|механик|мехатрон|электр|электрон|строител|конструкц|материал|сплав|алюмини|производств|стати|динами|прочност|усталост|трени|сопротивлен\p{L}*\s+материал|термодинами|теплопередач|теплообмен|теплопровод|турбин|гидравл|неразрывност|пневмат|управлен|пид|робот|датчик|привод|цеп|ом\p{L}*\s+закон|напряжен|деформац|балк|вал|подшипник|шестер|крутящ|мощност|сварк|коррози|допуск|посадк|нагруз|давлен|расход|температур|инженер|механика|мехатроника|электр|құрылыс|материал|қорытпа|алюмини|өндіріс|статика|динамика|беріктік|шаршау|үйкеліс|термодинамика|жылу|турбина|сұйық|гидравлика|пневматика|басқару|pid|робот|сенсор|жетек|тізбек|кернеу|деформац|арқалық|білік|мойынтірек|тісті|айналдыру\s+момент|дәнекер|коррозия|дәлдік|жүктеме|қысым|температура)/iu;
const RELATED_STEM = /(?:calculus|algebra|geometry|trigonometry|differential|integral|physics|chemistry|mathematics|statistics|математ|алгебр|геомет|тригоном|дифференциал|интеграл|физик|хими|статист|математика|алгебра|геометрия|физика|химия|статистика)/iu;

export function classifyEngineeringIntent(input: IntentInput): EngineeringIntent {
  const text = input.text.normalize("NFKC").trim();
  if (isStandardsLookupWarranted(text)) return "ENGINEERING_STANDARD";
  if (OFF_TOPIC.test(text) && !ENGINEERING.test(text) && !RELATED_STEM.test(text)) return "OFF_TOPIC";
  if (input.module === "engi_legal") return "ENGINEERING_STANDARD";
  if (input.hasImages) return "ENGINEERING_IMAGE";
  if (input.hasDocument) return "ENGINEERING_DOCUMENT";
  if (FOLLOW_UP.test(text)) return "ENGINEERING_CONCEPT";
  if (TROUBLESHOOTING.test(text)) return "ENGINEERING_TROUBLESHOOTING";
  if (PROGRAMMING.test(text)) return "ENGINEERING_PROGRAMMING";
  if (CALCULATION.test(text)) return "ENGINEERING_CALCULATION";
  if (DOCUMENT.test(text)) return "ENGINEERING_DOCUMENT";
  if (DESIGN.test(text) || input.module === "material" || input.module === "engi_match") return "ENGINEERING_DESIGN";
  if (ENGINEERING.test(text)) return "ENGINEERING_CONCEPT";
  if (RELATED_STEM.test(text)) return "RELATED_STEM";
  if (input.module === "patent") return "ENGINEERING_DOCUMENT";

  // Unknown or unusually phrased technical questions stay available rather than
  // being rejected by a brittle keyword-only gate. Only clear off-topic families
  // are redirected deterministically.
  return "RELATED_STEM";
}

export function isContextualEngineeringFollowUp(text: string): boolean {
  const normalized = text.normalize("NFKC").trim();
  return FOLLOW_UP.test(normalized)
    || /^(?:double\s+it|halve\s+it|what\s+if\s+.{1,80}|а\s+если\s+.{1,80}|удвой|уменьши\s+вдвое|екі\s+есе\s+.{1,80})\s*[?.!]*$/iu.test(normalized);
}

const REDIRECTS: Record<SupportedLanguage, string> = {
  ru: "Я сфокусирован на инженерных и технических задачах. Могу помочь с механикой, электроникой, материалами, CAD, расчётами, программированием для инженерии и смежными темами — попробуйте связать вопрос с технической задачей.",
  kk: "Мен инженерлік және техникалық тапсырмаларға бағытталғанмын. Механика, электроника, материалдар, CAD, есептеулер, инженерлік бағдарламалау және сабақтас тақырыптар бойынша көмектесе аламын — сұрақты техникалық міндетпен байланыстырып көріңіз.",
  en: "I’m focused on engineering and technical learning. I can help with mechanics, electronics, materials, CAD, calculations, engineering programming, and related topics—try connecting the question to a technical task.",
};

export function engineeringOffTopicRedirect(language: SupportedLanguage): string {
  return REDIRECTS[language];
}

export function buildCanonicalEngineeringPolicy(): string {
  return `[ENGINEERING REASONING POLICY]
- Focus on engineering and closely related technical learning. Do not turn a clearly unrelated request into a general-purpose assistant answer.
- Keep known engineering facts, user-provided values, explicit assumptions, estimates, and values requiring verification clearly distinguishable. Never present an assumption as user-provided fact.
- Never invent missing dimensions, loads, boundary conditions, material grades or properties, coefficients, tolerances, safety factors, limits, equations, citations, manufacturer data, or numeric results.
- When information is insufficient, give a useful symbolic relationship or method when possible and state exactly which inputs are still needed for a numeric or final answer.
- Use SI units by default unless the user specifies otherwise. Convert units explicitly, check dimensional compatibility, preserve sensible significant figures, and distinguish force from torque, mass from force, MPa from Pa, and temperature differences from absolute temperature.
- For a nontrivial calculation, identify the given values and requested result, label assumptions, show the applicable equation and substitution, carry units, and perform an order-of-magnitude, sign, unit, and physical-plausibility check. Do not force headings for trivial arithmetic.
- If the user supplies a questionable formula or value, do not silently accept or silently correct it; explain the issue and use the valid relation only when confident.
- Common approximate textbook properties or ranges may be offered only when clearly labeled approximate and educational. Exact grade-, condition-, interface-, temperature-, manufacturer-, code-, or site-dependent values require an authoritative source.
- For design questions, organize the answer around requirements, constraints, alternatives, trade-offs, failure modes, and verification steps. Do not present one arbitrary design as universally correct.
- For troubleshooting, distinguish observed symptoms, hypotheses, checks, confirmed causes, and next steps; prioritize high-information checks before replacement advice.
- For safety-critical or final real-world design decisions, recommend verification against authoritative drawings, manufacturer data, calculations, and applicable verified standards without adding a boilerplate disclaimer to every simple answer.
- Never fabricate a source or standard identifier. The separate KazStandard policy and deterministic identifier guard remain authoritative for numbered standards.
[/ENGINEERING REASONING POLICY]`;
}

export function buildEngineeringIntentPolicy(intent: EngineeringIntent): string {
  const guidance: Record<EngineeringIntent, string> = {
    ENGINEERING_CONCEPT: "Explain the engineering concept accurately and intuitively; add equations or examples only when useful.",
    ENGINEERING_CALCULATION: "Apply calculation discipline: do not invent missing inputs; distinguish given values from assumptions; verify units and include a concise sanity check.",
    ENGINEERING_DESIGN: "State requirements and missing constraints, compare viable approaches and failure modes, and avoid an unsupported final specification.",
    ENGINEERING_TROUBLESHOOTING: "Use a diagnostic sequence: symptom, plausible hypotheses, highest-information checks, interpretation, and next step. Do not claim an unverified cause.",
    ENGINEERING_PROGRAMMING: "Keep code and algorithms tied to the engineering task; state numerical assumptions, units, input bounds, and validation checks where relevant.",
    ENGINEERING_DOCUMENT: "Treat supplied or discussed documents as evidence with limited scope; distinguish what the document states from independently verified engineering fact.",
    ENGINEERING_IMAGE: "Distinguish visible observations from inferences and unknowns; never infer exact scale, hidden geometry, material grade, integrity, or compliance from appearance.",
    ENGINEERING_STANDARD: "Use the KazStandard verification policy as the authority for specific identifiers and current-status claims; general engineering guidance must not imply verified compliance.",
    RELATED_STEM: "Answer mathematics, physics, chemistry, study, or technical context in a way that supports engineering learning without inventing an engineering application.",
    OFF_TOPIC: "Return only the localized engineering-focus redirect supplied by the application.",
  };
  return `[RESOLVED ENGINEERING INTENT]
intent=${intent}
${guidance[intent]}
[/RESOLVED ENGINEERING INTENT]`;
}
