import type { KazStandardClient } from "./kazStandardClient";
import {
  KazStandardParserError,
  parseKazStandardDocument,
  parseKazStandardSearchResults,
  type KazStandardMetadata,
} from "./kazStandardParser";

export type StandardCurrency = "current" | "non_current" | "unknown";

export type VerifiedStandard = KazStandardMetadata & {
  currency: StandardCurrency;
  verifiedAt: string;
};

export type StandardsLookupResult =
  | { kind: "disabled" }
  | { kind: "unavailable" }
  | { kind: "no_result" }
  | { kind: "verified"; standard: VerifiedStandard }
  | { kind: "ambiguous"; candidates: VerifiedStandard[] };

type StandardsServiceOptions = {
  enabled: boolean;
  client: KazStandardClient;
  ttlMs?: number;
  now?: () => number;
  maxCandidates?: number;
};

function classifyCurrency(status: string | undefined): StandardCurrency {
  if (!status) return "unknown";
  const normalized = status.toLocaleLowerCase("ru");
  if (/(?:замен|отмен|утрат|не\s*действ|приостанов|withdrawn|replaced|cancelled|not active|suspended)/u.test(normalized)) {
    return "non_current";
  }
  if (/(?:действующ|active|current)/u.test(normalized)) return "current";
  return "unknown";
}

function normalizeDesignation(value: string): string {
  return value.toLocaleUpperCase("ru").replace(/[^\p{L}\p{N}]+/gu, "");
}

function extractDesignationQuery(query: string): string | undefined {
  const patterns = [
    /(?:СТ\s+РК|ҚР\s+СТ|ST\s+RK)\s+(?:(?:ISO|IEC|ГОСТ|GOST)\s+)?\d[\d.\/-]*/iu,
    /(?:ГОСТ|GOST)(?:\s+РК|\s+RK)?\s+\d[\d.\/-]*/iu,
    /(?:ISO|IEC)\s+\d[\d.\/-]*/iu,
    /(?:ЕСКД|ESKD|СП\s+РК|SP\s+RK|ТР\s+(?:ТС|ЕАЭС)|TR\s+EAEU)\s+\d[\d.\/-]*/iu,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern)?.[0];
    if (match) return match.replace(/\s+/gu, " ").trim();
  }
  return undefined;
}

export function createStandardsService(options: StandardsServiceOptions) {
  const ttlMs = options.ttlMs ?? 15 * 60_000;
  const now = options.now ?? Date.now;
  const maxCandidates = options.maxCandidates ?? 3;
  // Temporary POC cache: process-local, metadata-only, and intentionally not durable.
  const cache = new Map<string, { expiresAt: number; result: StandardsLookupResult }>();

  return {
    async searchVerifiedStandards(query: string): Promise<StandardsLookupResult> {
      if (!options.enabled) return { kind: "disabled" };

      const searchQuery = (extractDesignationQuery(query) ?? query.trim()).slice(0, 300);
      if (!searchQuery) return { kind: "no_result" };
      const cacheKey = searchQuery.toLocaleLowerCase("und");
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > now()) return cached.result;

      try {
        const searchPage = await options.client.searchKazStandard(searchQuery);
        const searchCandidates = parseKazStandardSearchResults(searchPage.html).slice(0, maxCandidates);
        if (searchCandidates.length === 0) {
          const result: StandardsLookupResult = { kind: "no_result" };
          cache.set(cacheKey, { expiresAt: now() + ttlMs, result });
          return result;
        }

        const verified: VerifiedStandard[] = [];
        for (const candidate of searchCandidates) {
          try {
            const detailPage = await options.client.getKazStandardDocument(candidate.providerId);
            const metadata = parseKazStandardDocument(detailPage.html, detailPage.sourceUrl);
            verified.push({
              ...metadata,
              currency: classifyCurrency(metadata.status),
              verifiedAt: new Date(now()).toISOString(),
            });
          } catch (error) {
            if (!(error instanceof KazStandardParserError)) throw error;
          }
        }

        let result: StandardsLookupResult;
        if (verified.length === 0) {
          result = { kind: "unavailable" };
        } else if (verified.length === 1) {
          result = { kind: "verified", standard: verified[0] };
        } else {
          const requestedDesignation = extractDesignationQuery(query);
          const exactMatches = requestedDesignation
            ? verified.filter((candidate) => normalizeDesignation(candidate.designation) === normalizeDesignation(requestedDesignation))
            : [];
          result = exactMatches.length === 1
            ? { kind: "verified", standard: exactMatches[0] }
            : { kind: "ambiguous", candidates: verified };
        }

        cache.set(cacheKey, { expiresAt: now() + ttlMs, result });
        return result;
      } catch {
        return { kind: "unavailable" };
      }
    },
  };
}
