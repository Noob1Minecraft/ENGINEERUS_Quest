import type { KazStandardSearchCandidate } from "./kazStandardParser";

const MAX_SEARCH_QUERIES = 3;
const MAX_QUERY_LENGTH = 120;

const EXACT_DESIGNATION_PATTERNS = [
  /(?:СТ\s+РК|ҚР\s+СТ|ST\s+RK)\s+(?:(?:ISO|IEC|ГОСТ|GOST)\s+)?\d[\d.\/-]*/iu,
  /(?:ГОСТ|GOST)(?:\s+РК|\s+RK)?\s+\d[\d.\/-]*/iu,
  /(?:ISO|IEC)\s+\d[\d.\/-]*/iu,
  /(?:ЕСКД|ESKD|СП\s+РК|SP\s+RK|ТР\s+(?:ТС|ЕАЭС)|TR\s+EAEU)\s+\d[\d.\/-]*/iu,
];

const DESIGN_DOCUMENTATION = /(?:конструкторск\p{L}*\s+документац\p{L}*|оформлен\p{L}*\s+черт[её]ж\p{L}*|design\s+documentation|engineering\s+drawing|конструкторлық\s+құжат|сызба\p{L}*\s+рәсім)/iu;
const DRAWING = /(?:черт[её]ж\p{L}*|drawing\p{L}*|сызба\p{L}*)/iu;
const MATERIAL_STANDARD = /(?:(?:стандарт|ГОСТ|СТ\s+РК|standard|сәйкестік)[^.!?]{0,80}(?:материал|сталь|сплав|steel|alloy|болат|қорытпа)|(?:материал|сталь|сплав|steel|alloy|болат|қорытпа)[^.!?]{0,80}(?:стандарт|ГОСТ|СТ\s+РК|standard|сәйкестік))/iu;
const MACHINE_SAFETY = /(?:безопасност\p{L}*\s+машин|machine\s+safety|machinery\s+safety|машиналар\p{L}*\s+қауіпсіз)/iu;
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
] as const;

const STOP_WORDS = new Set([
  "а", "the", "a", "an", "and", "or", "about", "for", "to", "of", "is", "are", "which", "what",
  "и", "или", "к", "ко", "по", "о", "об", "на", "для", "при", "этот", "эта", "это", "какой", "какие",
  "какая", "какого", "применяется", "применяются", "применим", "нужен", "нужна", "нужны", "требуется", "требуются",
  "стандарт", "стандарты", "гост", "ст", "рк",
  "және", "немесе", "үшін", "қандай", "қай", "қолданылады", "қажет", "талап",
]);

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
  if (MACHINE_SAFETY.test(input)) {
    addQuery(queries, "безопасность машин");
    addQuery(queries, "требования безопасности машин");
  } else if (MATERIAL_STANDARD.test(input)) {
    if (/(?:сталь|steel|болат)/iu.test(input)) addQuery(queries, "сталь");
    if (/(?:сплав|alloy|қорытпа)/iu.test(input)) addQuery(queries, "сплавы");
    addQuery(queries, "требования к материалам");
  }

  addQuery(queries, generalQuery(input));
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
  return token.length >= 7 ? token.slice(0, 7) : token;
}

export type RankedKazStandardCandidate = {
  candidate: KazStandardSearchCandidate;
  score: number;
  exactDesignationMatch: boolean;
  earlyStopEligible: boolean;
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
    const candidateNarrowApplications = matchingNarrowApplications(candidate.title);
    const unmatchedNarrowApplications = candidateNarrowApplications.filter((index) => !originalNarrowApplications.has(index));
    let score = exactDesignationMatch ? 100 : 0;

    for (const query of normalizedQueries) {
      if (query.length >= 4 && searchable.includes(query)) score += query.includes(" ") ? 8 : 4;
    }
    for (const term of terms) {
      if (searchableTermKeys.has(term)) score += 2;
    }
    if (broadQuestion && broadTitleMatch) score += 12;
    score += candidateNarrowApplications.filter((index) => originalNarrowApplications.has(index)).length * 6;
    score -= unmatchedNarrowApplications.length * 8;

    const status = normalizeText(candidate.status ?? "");
    if (/(?:действующ|active|current)/u.test(status)) score += 1;
    if (/(?:замен|отмен|не действ|withdrawn|replaced|cancelled)/u.test(status)) score -= 2;
    const earlyStopEligible = exactDesignationMatch || (
      score >= 8
      && unmatchedNarrowApplications.length === 0
      && (broadTitleMatch || candidateNarrowApplications.length > 0)
    );
    return { candidate, score, exactDesignationMatch, earlyStopEligible };
  }).sort((left, right) => (
    right.score - left.score
    || Number(right.exactDesignationMatch) - Number(left.exactDesignationMatch)
    || left.candidate.providerId.localeCompare(right.candidate.providerId)
  ));
}
