import type { KazStandardSearchCandidate } from "./kazStandardParser";

const MAX_SEARCH_QUERIES = 3;
const MAX_QUERY_LENGTH = 120;

const EXACT_DESIGNATION_PATTERNS = [
  /(?:СТ\s+РК|ҚР\s+СТ|ST\s+RK)\s+(?:(?:ISO|IEC|ГОСТ|GOST)\s+)?\d[\d.\/-]*/iu,
  /(?:ГОСТ|GOST)(?:\s+РК|\s+RK)?\s+\d[\d.\/-]*/iu,
  /(?:ISO|IEC)\s+\d[\d.\/-]*/iu,
  /(?:ЕСКД|ESKD|СП\s+РК|SP\s+RK|СНиП(?:\s+РК)?|SNIP(?:\s+RK)?|СН\s+РК|SN\s+RK|ТР\s+(?:ТС|ЕАЭС)|TR\s+EAEU)\s+\d[\d.\/-]*/iu,
];

const DESIGN_DOCUMENTATION = /(?:конструкторск\p{L}*\s+документац\p{L}*|оформлен\p{L}*\s+черт[её]ж\p{L}*|design\s+documentation|engineering\s+drawing|конструкторлық\s+құжат|сызба\p{L}*\s+рәсім)/iu;
const DRAWING = /(?:черт[её]ж\p{L}*|drawing\p{L}*|сызба\p{L}*)/iu;
const BROAD_TITLE = /(?:общие\s+(?:положения|требования|правила)|основные\s+положения|базовые\s+правила|general\s+(?:provisions|requirements|rules)|жалпы\s+(?:ережелер|талаптар|қағидалар)|негізгі\s+ережелер|базалық\s+қағидалар)/iu;
const NARROW_APPLICATIONS = [
  /(?:упаков|packag|қаптам)/iu,
  /(?:стекл|glass|шыны)/iu,
  /(?:эскиз|sketch|нобай)/iu,
  /(?:вакуум|vacuum)/iu,
  /(?:электронн|electronic|электрондық)/iu,
  /(?:космич|space|ғарыш)/iu,
  /(?:реабилитац|rehabilitation|оңалту)/iu,
  /(?:железнодорож|railway|теміржол)/iu,
  /(?:покрыт|coating|жабын)/iu,
  /(?:термическ|thermal|термиялық)/iu,
  /(?:эксплуатац|operating\s+document|пайдалану\s+құжат)/iu,
  /(?:текстов|textual\s+document|мәтіндік\s+құжат)/iu,
  /(?:трубопровод|pipeline|құбыр)/iu,
  /(?:нефтегаз|нефтян|газов|oil\s*(?:and|&)\s*gas|oil|gas|мұнай|газ)/iu,
  /(?:конструкционн\p{L}*\s+стал\p{L}*|structural\s+steel|конструкциялық\s+болат)/iu,
  /(?:сварн\p{L}*\s+соединен|welded\s+joint|дәнекерленген\s+қосыл)/iu,
  /(?:неразрушающ\p{L}*\s+контрол|неразрушающ\p{L}*\s+испытан|nondestructive\s+(?:testing|examination)|бұзбайтын\s+бақыла)/iu,
  /(?:гидроэлектростанц|(?<![\p{L}\p{N}])ГЭС(?![\p{L}\p{N}])|гидротехническ|hydroelectric|hydrotechnical|су\s+электр\s+станц)/iu,
] as const;

const STOP_WORDS = new Set([
  "а", "the", "a", "an", "and", "or", "about", "for", "to", "of", "is", "are", "which", "what",
  "и", "или", "к", "ко", "по", "о", "об", "на", "для", "при", "этот", "эта", "это", "какой", "какие",
  "какая", "какого", "применяется", "применяются", "применим", "используется", "используются", "нужен", "нужна", "нужны", "требуется", "требуются",
  "стандарт", "стандарты", "гост", "ст", "рк",
  "және", "немесе", "үшін", "қандай", "қай", "қолданылады", "қажет", "талап",
]);

type EngineeringTerminologyRule = {
  pattern: RegExp;
  queries: readonly string[] | ((input: string) => readonly string[]);
};

const ENGINEERING_TERMINOLOGY: readonly EngineeringTerminologyRule[] = [
  {
    pattern: /(?:сейсмостойк\p{L}*|сейсмическ\p{L}*\s+(?:воздейств\p{L}*|район\p{L}*)|землетрясен\p{L}*|seismic\p{L}*|earthquake\p{L}*|сейсмик\p{L}*)/iu,
    queries: (input) => /(?:здани\p{L}*|сооружени\p{L}*|строительств\p{L}*|building\p{L}*|structure\p{L}*|construction\p{L}*|ғимарат\p{L}*|құрылыс\p{L}*)/iu.test(input)
      ? ["сейсмостойкость зданий", "сейсмические районы", "сейсмические воздействия конструкции"]
      : ["сейсмостойкость", "сейсмические воздействия", "землетрясения"],
  },
  {
    pattern: /(?:размер\p{L}*|допуск\p{L}*|посадк\p{L}*|предельн\p{L}*\s+отклонен\p{L}*)/iu,
    queries: ["допуски и посадки", "размеры предельные отклонения"],
  },
  { pattern: /(?:(?<![\p{L}\p{N}])вал(?:ы|а|ов|у|ом|ах)?(?![\p{L}\p{N}])|детал\p{L}*\s+типа\s+вал)/iu, queries: ["валы"] },
  { pattern: /(?:подшипник\p{L}*)/iu, queries: ["подшипники", "подшипники качения"] },
  { pattern: /(?:зубчат\p{L}*\s+(?:передач|колес)|шестерн\p{L}*)/iu, queries: ["зубчатые передачи", "зубчатые колеса"] },
  { pattern: /(?:креп[её]ж\p{L}*|болт\p{L}*|гайк\p{L}*|винт\p{L}*)/iu, queries: ["крепежные изделия"] },
  { pattern: /(?:резьб\p{L}*)/iu, queries: ["резьба", "резьбовые соединения"] },
  {
    pattern: /(?:материал\p{L}*|стал\p{L}*|сплав\p{L}*|material\p{L}*|steel|alloy\p{L}*|болат|қорытпа\p{L}*)/iu,
    queries: (input) => [
      ...(/(?:конструкционн\p{L}*\s+стал\p{L}*|structural\s+steel|конструкциялық\s+болат)/iu.test(input) ? ["конструкционные стали"] : []),
      ...(/(?:нержавеющ\p{L}*\s+стал\p{L}*|stainless\s+steel|тот баспайтын\s+болат)/iu.test(input) ? ["нержавеющая сталь"] : []),
      ...(/(?:стал\p{L}*|steel|болат)/iu.test(input) ? ["сталь"] : []),
      ...(/(?:сплав\p{L}*|alloy\p{L}*|қорытпа\p{L}*)/iu.test(input) ? ["сплавы"] : []),
      "требования к материалам",
    ],
  },
  { pattern: /(?:сварк\p{L}*|сварн\p{L}*\s+соединен\p{L}*)/iu, queries: ["сварка", "сварные соединения"] },
  { pattern: /(?:корроз\p{L}*|антикорроз\p{L}*)/iu, queries: ["защита от коррозии", "антикоррозионные покрытия"] },
  { pattern: /(?:железобетон\p{L}*)/iu, queries: ["железобетонные конструкции", "железобетон"] },
  { pattern: /(?:(?<![\p{L}\p{N}])бетон\p{L}*(?![\p{L}\p{N}]))/iu, queries: ["бетон", "бетонные конструкции"] },
  { pattern: /(?:безопасност\p{L}*\s+машин|безопасн\p{L}*\s+оборудован\p{L}*|machine\s+safety|machinery\s+safety|машиналар\p{L}*\s+қауіпсіз)/iu, queries: ["безопасность машин", "требования безопасности машин"] },
  { pattern: /(?:электробезопасност\p{L}*|электрическ\p{L}*\s+безопасност\p{L}*)/iu, queries: ["электробезопасность", "безопасность электрооборудования"] },
  { pattern: /(?:электроустанов\p{L}*|электрическ\p{L}*\s+установ\p{L}*)/iu, queries: ["электроустановки", "электрические установки"] },
  { pattern: /(?:оборудован\p{L}*\s+под\s+давлени\p{L}*|сосуд\p{L}*\s+под\s+давлени\p{L}*)/iu, queries: ["оборудование под давлением", "сосуды под давлением"] },
  { pattern: /(?:трубопровод\p{L}*)/iu, queries: ["трубопроводы"] },
  { pattern: /(?:метролог\p{L}*|измерен\p{L}*|средств\p{L}*\s+измерен\p{L}*)/iu, queries: ["метрология", "средства измерений", "единство измерений"] },
  { pattern: /(?:техническ\p{L}*\s+услови\p{L}*|техуслови\p{L}*|(?<![\p{L}\p{N}])ТУ(?![\p{L}\p{N}]))/iu, queries: ["технические условия", "разработка технических условий"] },
  { pattern: /(?:эксплуатационн\p{L}*\s+документац\p{L}*|руководств\p{L}*\s+по\s+эксплуатац\p{L}*)/iu, queries: ["эксплуатационная документация", "руководство по эксплуатации"] },
] as const;

function normalizeSpace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function normalizeText(value: string): string {
  return normalizeSpace(value.normalize("NFKC").toLocaleLowerCase("und").replace(/ё/gu, "е").replace(/[^\p{L}\p{N}]+/gu, " "));
}

function normalizeDesignation(value: string): string {
  return value.normalize("NFKC").toLocaleUpperCase("und").replace(/[^\p{L}\p{N}]+/gu, "");
}

export function extractExactStandardDesignation(query: string): string | undefined {
  for (const pattern of EXACT_DESIGNATION_PATTERNS) {
    const match = query.match(pattern)?.[0];
    if (match) return normalizeSpace(match);
  }
  return undefined;
}

function addQuery(queries: string[], value: string): void {
  const query = normalizeSpace(value).slice(0, MAX_QUERY_LENGTH);
  if (!query) return;
  const normalized = normalizeText(query);
  if (!normalized || queries.some((existing) => normalizeText(existing) === normalized)) return;
  if (queries.length < MAX_SEARCH_QUERIES) queries.push(query);
}

function generalQuery(input: string): string {
  return normalizeText(input)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .slice(0, 10)
    .join(" ");
}

export function generateKazStandardQueries(input: string): string[] {
  const exactDesignation = extractExactStandardDesignation(input);
  if (exactDesignation) return [exactDesignation];

  const queries: string[] = [];
  if (DESIGN_DOCUMENTATION.test(input)) {
    addQuery(queries, "конструкторская документация");
    addQuery(queries, "ЕСКД");
    addQuery(queries, "оформление чертежей");
    return queries;
  }
  if (DRAWING.test(input)) {
    addQuery(queries, "оформление чертежей");
    addQuery(queries, "конструкторская документация");
    addQuery(queries, "ЕСКД");
    return queries;
  }

  for (const rule of ENGINEERING_TERMINOLOGY) {
    if (!rule.pattern.test(input)) continue;
    const mappedQueries = typeof rule.queries === "function" ? rule.queries(input) : rule.queries;
    for (const query of mappedQueries) addQuery(queries, query);
  }

  if (queries.length === 0) addQuery(queries, generalQuery(input));
  return queries.slice(0, MAX_SEARCH_QUERIES);
}

function relevanceTerms(originalQuery: string, searchQueries: readonly string[]): string[] {
  const terms = new Set<string>();
  for (const value of [originalQuery, ...searchQueries]) {
    for (const token of normalizeText(value).split(" ")) {
      if (token.length >= 4 && !STOP_WORDS.has(token)) terms.add(relevanceKey(token));
    }
  }
  return [...terms];
}

function relevanceKey(token: string): string {
  if (/^стал/iu.test(token)) return "стал";
  return token.length >= 7 ? token.slice(0, 7) : token;
}

function requiredTopicPattern(originalQuery: string): RegExp | undefined {
  const asksAboutSeismicBuildings = /(?:сейсмостойк\p{L}*|сейсмическ\p{L}*|землетрясен\p{L}*|seismic\p{L}*|earthquake\p{L}*|сейсмик\p{L}*)/iu.test(originalQuery)
    && /(?:здани\p{L}*|сооружени\p{L}*|строительств\p{L}*|building\p{L}*|structure\p{L}*|ғимарат\p{L}*|құрылыс\p{L}*)/iu.test(originalQuery);
  if (asksAboutSeismicBuildings) {
    return /(?=.*(?:сейсмостойк|сейсмическ|землетрясен|seismic|earthquake|сейсмик))(?=.*(?:здани|сооружени|строительств|строительн\p{L}*\s+конструкц|building|structure|construction|ғимарат|құрылыс))/iu;
  }
  if (/(?:конструкционн\p{L}*\s+стал\p{L}*|structural\s+steel|конструкциялық\s+болат)/iu.test(originalQuery)) {
    return /(?=.*(?:конструкционн|structural|конструкциялық))(?=.*(?:стал|steel|болат))/iu;
  }
  if (/(?:нержавеющ\p{L}*\s+стал\p{L}*|stainless\s+steel|тот баспайтын\s+болат)/iu.test(originalQuery)) {
    return /(?=.*(?:нержавеющ|stainless|тот баспайтын))(?=.*(?:стал|steel|болат))/iu;
  }
  if (/(?:железобетон\p{L}*|reinforced\s+concrete|темірбетон\p{L}*)/iu.test(originalQuery)) {
    return /(?:железобетон|reinforced\s+concrete|темірбетон)/iu;
  }
  return undefined;
}

export type RankedKazStandardCandidate = {
  candidate: KazStandardSearchCandidate;
  score: number;
  exactDesignationMatch: boolean;
  earlyStopEligible: boolean;
  topicRelevant: boolean;
};

function matchingNarrowApplications(value: string): number[] {
  return NARROW_APPLICATIONS.flatMap((pattern, index) => pattern.test(value) ? [index] : []);
}

export function rankKazStandardCandidates(
  candidates: readonly KazStandardSearchCandidate[],
  originalQuery: string,
  searchQueries: readonly string[],
): RankedKazStandardCandidate[] {
  const requestedDesignation = extractExactStandardDesignation(originalQuery);
  const normalizedRequestedDesignation = requestedDesignation ? normalizeDesignation(requestedDesignation) : undefined;
  const normalizedQueries = searchQueries.map(normalizeText).filter(Boolean);
  const terms = relevanceTerms(originalQuery, searchQueries);
  const originalTerms = relevanceTerms(originalQuery, []);
  const requiredTopic = requiredTopicPattern(originalQuery);
  const originalNarrowApplications = new Set(matchingNarrowApplications(originalQuery));
  const broadQuestion = normalizedRequestedDesignation === undefined && originalNarrowApplications.size === 0;

  return candidates.map((candidate) => {
    const normalizedTitle = normalizeText(candidate.title);
    const normalizedCandidateDesignation = normalizeDesignation(candidate.designation);
    const searchable = `${normalizedTitle} ${normalizeText(candidate.designation)}`;
    const searchableTermKeys = new Set(searchable.split(" ").filter(Boolean).map(relevanceKey));
    const exactDesignationMatch = normalizedRequestedDesignation !== undefined
      && normalizedCandidateDesignation === normalizedRequestedDesignation;
    const broadTitleMatch = BROAD_TITLE.test(candidate.title);
    const originalTopicMatches = originalTerms.filter((term) => searchableTermKeys.has(term)).length;
    const topicMatches = requiredTopic
      ? requiredTopic.test(candidate.title)
      : originalTopicMatches > 0;
    const candidateNarrowApplications = matchingNarrowApplications(candidate.title);
    const unmatchedNarrowApplications = candidateNarrowApplications.filter((index) => !originalNarrowApplications.has(index));
    const topicRelevant = exactDesignationMatch || (topicMatches && unmatchedNarrowApplications.length === 0);
    let score = exactDesignationMatch ? 100 : 0;

    for (const query of normalizedQueries) {
      if (query.length >= 4 && searchable.includes(query)) score += query.includes(" ") ? 8 : 4;
    }
    for (const term of terms) {
      if (searchableTermKeys.has(term)) score += 2;
    }
    if (broadQuestion && broadTitleMatch && topicRelevant) score += 12;
    score += candidateNarrowApplications.filter((index) => originalNarrowApplications.has(index)).length * 6;
    score -= unmatchedNarrowApplications.length * 8;

    const status = normalizeText(candidate.status ?? "");
    if (/(?:действующ|active|current)/u.test(status)) score += 1;
    if (/(?:замен|отмен|не действ|withdrawn|replaced|cancelled)/u.test(status)) score -= 2;
    const earlyStopEligible = exactDesignationMatch || (
      score >= 8
      && topicRelevant
      && unmatchedNarrowApplications.length === 0
      && (broadTitleMatch || candidateNarrowApplications.length > 0)
    );
    return { candidate, score, exactDesignationMatch, earlyStopEligible, topicRelevant };
  }).sort((left, right) => (
    right.score - left.score
    || Number(right.exactDesignationMatch) - Number(left.exactDesignationMatch)
    || left.candidate.providerId.localeCompare(right.candidate.providerId)
  ));
}
