const KAZSTANDARD_ORIGIN = "https://new-shop.ksm.kz";

export class KazStandardParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KazStandardParserError";
  }
}

export type KazStandardSearchCandidate = {
  providerId: string;
  designation: string;
  title: string;
  status?: string;
  sourceUrl: string;
};

export type KazStandardMetadata = KazStandardSearchCandidate & {
  languages?: string[];
  mksIcs?: string[];
  registrationDate?: string;
  effectiveDate?: string;
  replaces?: string[];
  annotation?: string;
  keywords?: string[];
};

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (entity, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named[code.toLowerCase()] ?? entity;
  });
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/gu, " ")).replace(/\s+/gu, " ").trim();
}

function requiredClassText(html: string, tag: string, className: string, fieldName: string): string {
  const match = html.match(new RegExp(`<${tag}[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}>`, "iu"));
  const value = match ? cleanText(match[1]) : "";
  if (!value) throw new KazStandardParserError(`Missing required ${fieldName}.`);
  return value;
}

function optionalClassText(html: string, tag: string, className: string): string | undefined {
  const match = html.match(new RegExp(`<${tag}[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}>`, "iu"));
  const value = match ? cleanText(match[1]) : "";
  return value || undefined;
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(/\s*(?:\+|,|;)\s*/u).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function parseMetaItems(html: string): Map<string, string> {
  const values = new Map<string, string>();
  const itemPattern = /<div[^>]*class=["'][^"']*\bdetail-meta-item\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/giu;
  for (const item of html.matchAll(itemPattern)) {
    const label = optionalClassText(item[1], "span", "dm-label");
    const value = optionalClassText(item[1], "span", "dm-value");
    if (label && value) values.set(label.toLocaleLowerCase("ru"), value);
  }
  return values;
}

function sectionParagraph(html: string, heading: string): string | undefined {
  const pattern = new RegExp(`<div[^>]*class=["'][^"']*\\bdetail-section\\b[^"']*["'][^>]*>\\s*<h4[^>]*>\\s*(?:${heading})\\s*<\\/h4>\\s*<p[^>]*>([\\s\\S]*?)<\\/p>`, "iu");
  const value = html.match(pattern)?.[1];
  const cleaned = value ? cleanText(value) : "";
  return cleaned || undefined;
}

export function parseKazStandardSearchResults(html: string): KazStandardSearchCandidate[] {
  const candidates: KazStandardSearchCandidate[] = [];
  const cardPattern = /<a[^>]*href=["']\/catalog\/document\/(\d+)\/["'][^>]*class=["'][^"']*\bprod-top\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/giu;

  for (const match of html.matchAll(cardPattern)) {
    const providerId = match[1];
    const card = match[2];
    candidates.push({
      providerId,
      designation: requiredClassText(card, "div", "prod-code", "search designation"),
      title: requiredClassText(card, "div", "prod-title", "search title"),
      status: optionalClassText(card, "span", "prod-badge"),
      sourceUrl: `${KAZSTANDARD_ORIGIN}/catalog/document/${providerId}/`,
    });
  }

  if (candidates.length === 0 && !/(?:Документы не найдены|Ничего не найдено|No documents found)/iu.test(html)) {
    throw new KazStandardParserError("KazStandard search markup was not recognized.");
  }
  return candidates;
}

export function parseKazStandardDocument(html: string, sourceUrl: string): KazStandardMetadata {
  const url = new URL(sourceUrl);
  if (url.origin !== KAZSTANDARD_ORIGIN) throw new KazStandardParserError("Unexpected document source URL.");
  const idMatch = url.pathname.match(/^\/catalog\/document\/(\d+)\/$/u);
  if (!idMatch) throw new KazStandardParserError("Document source URL has an unexpected path.");

  const meta = parseMetaItems(html);
  const keywordSection = html.match(/<div[^>]*class=["'][^"']*\bdetail-section\b[^"']*["'][^>]*>\s*<h4[^>]*>\s*Ключевые слова\s*<\/h4>([\s\S]*?)<\/div>\s*<\/div>/iu)?.[1];
  const keywords = keywordSection
    ? [...keywordSection.matchAll(/<span[^>]*class=["'][^"']*\bdetail-tag\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/giu)]
      .map((match) => cleanText(match[1]))
      .filter(Boolean)
    : [];

  return {
    providerId: idMatch[1],
    designation: requiredClassText(html, "h1", "detail-code", "document designation"),
    title: requiredClassText(html, "h2", "detail-title", "document title"),
    status: optionalClassText(html, "span", "prod-badge"),
    languages: parseList(meta.get("язык") ?? meta.get("language")),
    mksIcs: parseList(meta.get("мкс") ?? meta.get("ics")),
    registrationDate: meta.get("дата регистрации") ?? meta.get("registration date"),
    effectiveDate: meta.get("действует с") ?? meta.get("effective date"),
    replaces: parseList(sectionParagraph(html, "Заменяет|Replaces")),
    annotation: sectionParagraph(html, "Аннотация|Annotation"),
    keywords: keywords.length > 0 ? keywords : undefined,
    sourceUrl: url.toString(),
  };
}
