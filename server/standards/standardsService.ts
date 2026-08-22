import type { KazStandardClient } from "./kazStandardClient";
import {
  parseKazStandardDocument,
  parseKazStandardSearchResults,
  type KazStandardMetadata,
} from "./kazStandardParser";
import {
  extractExactStandardDesignation,
  generateKazStandardQueries,
  rankKazStandardCandidates,
  type RankedKazStandardCandidate,
} from "./standardsQuery";

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
  return value.toLocaleUpperCase("und").replace(/[^\p{L}\p{N}]+/gu, "");
}

export function createStandardsService(options: StandardsServiceOptions) {
  const ttlMs = options.ttlMs ?? 15 * 60_000;
  const now = options.now ?? Date.now;
  const maxCandidates = Math.max(1, Math.min(options.maxCandidates ?? 3, 3));
  // Temporary POC cache: process-local, metadata-only, and intentionally not durable.
  const cache = new Map<string, { expiresAt: number; result: StandardsLookupResult }>();

  return {
    async searchVerifiedStandards(query: string): Promise<StandardsLookupResult> {
      if (!options.enabled) return { kind: "disabled" };

      const originalQuery = query.trim().slice(0, 300);
      const searchQueries = generateKazStandardQueries(originalQuery);
      if (searchQueries.length === 0) return { kind: "no_result" };
      const cacheKey = originalQuery.toLocaleLowerCase("und");
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > now()) return cached.result;

      const candidateById = new Map<string, ReturnType<typeof parseKazStandardSearchResults>[number]>();
      const attemptedDocumentIds = new Set<string>();
      const verified: VerifiedStandard[] = [];
      let earlyStopVerified = false;
      let lookupFailed = false;

      const verifyCandidates = async (ranked: readonly RankedKazStandardCandidate[]): Promise<void> => {
        for (const { candidate, score } of ranked) {
          if (verified.length >= maxCandidates || attemptedDocumentIds.size >= maxCandidates) break;
          if (score < 2 || attemptedDocumentIds.has(candidate.providerId)) continue;
          attemptedDocumentIds.add(candidate.providerId);
          try {
            const detailPage = await options.client.getKazStandardDocument(candidate.providerId);
            const metadata = parseKazStandardDocument(detailPage.html, detailPage.sourceUrl);
            const detailRank = rankKazStandardCandidates([metadata], originalQuery, searchQueries)[0];
            if (!detailRank || detailRank.score < 2) continue;
            if (detailRank.earlyStopEligible) earlyStopVerified = true;
            verified.push({
              ...metadata,
              currency: classifyCurrency(metadata.status),
              verifiedAt: new Date(now()).toISOString(),
            });
          } catch {
            lookupFailed = true;
          }
        }
      };

      for (const searchQuery of searchQueries) {
        try {
          const searchPage = await options.client.searchKazStandard(searchQuery);
          for (const candidate of parseKazStandardSearchResults(searchPage.html)) {
            if (!candidateById.has(candidate.providerId)) candidateById.set(candidate.providerId, candidate);
          }
          const ranked = rankKazStandardCandidates([...candidateById.values()], originalQuery, searchQueries);
          const earlyStopCandidates = ranked.filter(({ earlyStopEligible }) => earlyStopEligible);
          if (earlyStopCandidates.length > 0) {
            await verifyCandidates(earlyStopCandidates);
            if (earlyStopVerified) break;
          }
        } catch {
          lookupFailed = true;
        }
      }

      if (verified.length === 0 && attemptedDocumentIds.size < maxCandidates) {
        const ranked = rankKazStandardCandidates([...candidateById.values()], originalQuery, searchQueries);
        await verifyCandidates(ranked);
      }

      let result: StandardsLookupResult;
      if (verified.length === 0) {
        result = lookupFailed ? { kind: "unavailable" } : { kind: "no_result" };
      } else if (verified.length === 1) {
        result = { kind: "verified", standard: verified[0] };
      } else {
        const requestedDesignation = extractExactStandardDesignation(originalQuery);
        const exactMatches = requestedDesignation
          ? verified.filter((candidate) => normalizeDesignation(candidate.designation) === normalizeDesignation(requestedDesignation))
          : [];
        result = exactMatches.length === 1
          ? { kind: "verified", standard: exactMatches[0] }
          : { kind: "ambiguous", candidates: verified };
      }

      if (result.kind !== "unavailable") {
        cache.set(cacheKey, { expiresAt: now() + ttlMs, result });
      }
      return result;
    },
  };
}
