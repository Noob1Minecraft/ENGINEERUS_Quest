import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { ChatRepository } from "../server/persistence/chats";
import { createAiRouter } from "../server/routes/ai";
import { loadServerEnv } from "../server/config/env";
import { createKazStandardClient, type KazStandardClient } from "../server/standards/kazStandardClient";
import {
  KazStandardParserError,
  parseKazStandardDocument,
  parseKazStandardSearchResults,
} from "../server/standards/kazStandardParser";
import {
  buildVerifiedStandardsContext,
  isStandardsLookupWarranted,
  preparePromptWithStandardsMetadata,
} from "../server/standards/standardsPolicy";
import { createStandardsService, type VerifiedStandard } from "../server/standards/standardsService";
import { withServer } from "./helpers";

const SEARCH_HTML = readFileSync(new URL("./fixtures/kazstandard-search.html", import.meta.url), "utf8");
const DOCUMENT_HTML = readFileSync(new URL("./fixtures/kazstandard-document.html", import.meta.url), "utf8");
const DOCUMENT_URL = "https://new-shop.ksm.kz/catalog/document/66007/";

function fixtureClient(overrides: Partial<KazStandardClient> = {}): KazStandardClient {
  return {
    async searchKazStandard() {
      return { html: SEARCH_HTML, sourceUrl: "https://new-shop.ksm.kz/catalog/search/?q=test" };
    },
    async getKazStandardDocument() {
      return { html: DOCUMENT_HTML, sourceUrl: DOCUMENT_URL };
    },
    ...overrides,
  };
}

test("keeps the backend feature flag disabled unless explicitly set to true", () => {
  assert.equal(loadServerEnv({}).KAZSTANDARD_LOOKUP_ENABLED, false);
  assert.equal(loadServerEnv({ KAZSTANDARD_LOOKUP_ENABLED: "false" }).KAZSTANDARD_LOOKUP_ENABLED, false);
  assert.equal(loadServerEnv({ KAZSTANDARD_LOOKUP_ENABLED: "true" }).KAZSTANDARD_LOOKUP_ENABLED, true);
  assert.throws(
    () => loadServerEnv({ KAZSTANDARD_LOOKUP_ENABLED: "yes" }),
    /KAZSTANDARD_LOOKUP_ENABLED/u,
  );
});

test("parses strict public search and detail metadata from saved HTML fixtures", () => {
  assert.deepEqual(parseKazStandardSearchResults(SEARCH_HTML), [{
    providerId: "66007",
    designation: "СТ РК ISO 9001-2016",
    title: "Системы менеджмента качества Требования",
    status: "Действующий",
    sourceUrl: DOCUMENT_URL,
  }]);

  const metadata = parseKazStandardDocument(DOCUMENT_HTML, DOCUMENT_URL);
  assert.deepEqual(metadata, {
    providerId: "66007",
    designation: "СТ РК ISO 9001-2016",
    title: "Системы менеджмента качества Требования",
    status: "Действующий",
    languages: ["Казахский", "русский"],
    mksIcs: ["03.120.10"],
    registrationDate: "14.11.2016",
    effectiveDate: "01.01.2017",
    replaces: ["СТ РК ISO 9001-2009"],
    annotation: "Публичная аннотация стандарта.",
    keywords: ["система менеджмента качества", "риск"],
    sourceUrl: DOCUMENT_URL,
  });
  assert.doesNotMatch(JSON.stringify(metadata), /\.pdf|paid\/full-standard/iu);
});

test("fails closed on unexpected markup and never fabricates missing optional fields", () => {
  assert.throws(
    () => parseKazStandardDocument("<html><h1>Changed page</h1></html>", DOCUMENT_URL),
    KazStandardParserError,
  );

  const minimal = `
    <h1 class="detail-code">СТ РК 1-2026</h1>
    <h2 class="detail-title">Проверяемое название</h2>
  `;
  const metadata = parseKazStandardDocument(minimal, "https://new-shop.ksm.kz/catalog/document/1/");
  assert.equal(metadata.status, undefined);
  assert.equal(metadata.annotation, undefined);
  assert.equal(metadata.effectiveDate, undefined);
  assert.equal(metadata.replaces, undefined);
  assert.equal(metadata.keywords, undefined);
});

test("keeps lookup eligibility conservative", () => {
  assert.equal(isStandardsLookupWarranted("Что такое момент инерции?"), false);
  assert.equal(isStandardsLookupWarranted("Explain kinematics vs dynamics"), false);
  assert.equal(isStandardsLookupWarranted("Какие бывают инженерные материалы?"), false);
  assert.equal(isStandardsLookupWarranted("Какие требования у СТ РК ISO 9001-2016?"), true);
  assert.equal(isStandardsLookupWarranted("Does this drawing comply with mandatory requirements?"), true);
});

test("disabled flag and conceptual questions cause zero external requests", async () => {
  let externalRequests = 0;
  const client = fixtureClient({
    async searchKazStandard() {
      externalRequests += 1;
      throw new Error("must not run");
    },
  });
  const disabled = createStandardsService({ enabled: false, client });
  assert.deepEqual(await disabled.searchVerifiedStandards("СТ РК ISO 9001-2016"), { kind: "disabled" });

  const enabled = createStandardsService({ enabled: true, client });
  const conceptual = "Что такое момент инерции?";
  assert.equal(await preparePromptWithStandardsMetadata(conceptual, enabled.searchVerifiedStandards), conceptual);
  assert.equal(externalRequests, 0);
});

test("standards-related query performs a metadata-only GET with encoded input", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchStub: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(SEARCH_HTML, { status: 200, headers: { "Content-Type": "text/html" } });
  };
  const client = createKazStandardClient({ fetchImpl: fetchStub });
  await client.searchKazStandard("СТ РК ISO 9001-2016 & test");

  assert.equal(requests.length, 1);
  assert.equal(requests[0].init?.method, "GET");
  assert.equal(requests[0].init?.credentials, "omit");
  assert.equal(requests[0].init?.redirect, "manual");
  assert.match(requests[0].url, /^https:\/\/new-shop\.ksm\.kz\/catalog\/search\/\?q=/u);
  assert.ok(requests[0].url.includes("%26+test"));
  assert.doesNotMatch(requests[0].url, /\.pdf/iu);
  await assert.rejects(() => client.getKazStandardDocument("../media/paid.pdf"), /numeric/u);
});

test("returns verified detail metadata and caches it in memory", async () => {
  let searches = 0;
  let details = 0;
  let receivedQuery = "";
  const client = fixtureClient({
    async searchKazStandard(query) {
      searches += 1;
      receivedQuery = query;
      return { html: SEARCH_HTML, sourceUrl: "https://new-shop.ksm.kz/catalog/search/?q=test" };
    },
    async getKazStandardDocument() {
      details += 1;
      return { html: DOCUMENT_HTML, sourceUrl: DOCUMENT_URL };
    },
  });
  const service = createStandardsService({ enabled: true, client, now: () => 1_786_924_800_000 });

  const first = await service.searchVerifiedStandards("СТ РК ISO 9001-2016");
  const second = await service.searchVerifiedStandards("СТ РК ISO 9001-2016");
  assert.equal(first.kind, "verified");
  assert.deepEqual(second, first);
  assert.equal(searches, 1);
  assert.equal(details, 1);
  assert.equal(receivedQuery, "СТ РК ISO 9001-2016");
});

test("returns verified candidates when search results are ambiguous", async () => {
  const ambiguousSearch = SEARCH_HTML.replace(
    "</body>",
    `<div class="prod-card"><a href="/catalog/document/66008/" class="prod-top"><span class="prod-badge">Заменен</span><div class="prod-code">СТ РК ISO 9001-2009</div><div class="prod-title">Предыдущая редакция</div></a></div></body>`,
  );
  const client = fixtureClient({
    async searchKazStandard() {
      return { html: ambiguousSearch, sourceUrl: "https://new-shop.ksm.kz/catalog/search/?q=quality" };
    },
    async getKazStandardDocument(documentId) {
      if (documentId === "66007") return { html: DOCUMENT_HTML, sourceUrl: DOCUMENT_URL };
      return {
        html: `<h1 class="detail-code">СТ РК ISO 9001-2009</h1><span class="prod-badge">Заменен</span><h2 class="detail-title">Предыдущая редакция</h2>`,
        sourceUrl: "https://new-shop.ksm.kz/catalog/document/66008/",
      };
    },
  });
  const result = await createStandardsService({ enabled: true, client }).searchVerifiedStandards("система качества");

  assert.equal(result.kind, "ambiguous");
  if (result.kind === "ambiguous") {
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].currency, "current");
    assert.equal(result.candidates[1].currency, "non_current");
  }
});

test("builds a bounded verified metadata block for the AI without full document content", async () => {
  const standard: VerifiedStandard = {
    ...parseKazStandardDocument(DOCUMENT_HTML, DOCUMENT_URL),
    currency: "current",
    verifiedAt: "2026-08-20T00:00:00.000Z",
  };
  const prompt = "Что требует СТ РК ISO 9001-2016?";
  let lookupCalls = 0;
  const enriched = await preparePromptWithStandardsMetadata(prompt, async () => {
    lookupCalls += 1;
    return { kind: "verified", standard };
  });

  assert.equal(lookupCalls, 1);
  assert.match(enriched, /\[VERIFIED KAZSTANDARD METADATA\]/u);
  assert.match(enriched, /Source: https:\/\/new-shop\.ksm\.kz\/catalog\/document\/66007\//u);
  assert.match(enriched, /catalog metadata only/u);
  assert.doesNotMatch(enriched, /Публичная аннотация|\.pdf/iu);
  assert.equal(buildVerifiedStandardsContext({ kind: "disabled" }), undefined);
});

test("fails safely when the metadata lookup is unavailable", async () => {
  const enriched = await preparePromptWithStandardsMetadata(
    "Какой ГОСТ применяется к этому чертежу?",
    async () => { throw new Error("catalog unavailable"); },
  );
  assert.match(enriched, /KazStandard was unavailable/u);
  assert.match(enriched, /Do not provide exact unverified standard identifiers/u);
});

test("passes verified metadata to the AI without changing the persisted user prompt", async () => {
  const userPrompt = "Какие требования у СТ РК ISO 9001-2016?";
  const standard: VerifiedStandard = {
    ...parseKazStandardDocument(DOCUMENT_HTML, DOCUMENT_URL),
    currency: "current",
    verifiedAt: "2026-08-20T00:00:00.000Z",
  };
  let persistedUserPrompt = "";
  let aiPrompt = "";
  const repository = {
    async beginExchange(
      _userId: string,
      _accessToken: string,
      _sessionId: string,
      _requestId: string,
      text: string,
    ) {
      persistedUserPrompt = text;
      return {
        userMessage: { id: "user-message", sender: "user" as const, text, module: "tutor" as const, timestamp: "2026-08-20T00:00:00.000Z" },
        assistantMessage: null,
        progress: { xp: 0, level: 1, streak: 0, requests_count: 0, material_count: 0, patent_count: 0, modules_used: [] },
      };
    },
    async completeExchange(
      _userId: string,
      _accessToken: string,
      _sessionId: string,
      requestId: string,
      responseText: string,
    ) {
      return {
        userMessage: { id: "user-message", sender: "user" as const, text: userPrompt, module: "tutor" as const, timestamp: "2026-08-20T00:00:00.000Z" },
        assistantMessage: { id: "assistant-message", sender: "ai" as const, text: responseText, module: "tutor" as const, timestamp: "2026-08-20T00:00:01.000Z", requestId, xpEarned: 10 },
        progress: { xp: 10, level: 1, streak: 1, requests_count: 1, material_count: 0, patent_count: 0, modules_used: ["tutor"] },
        awarded: true,
      };
    },
  } as unknown as ChatRepository;
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.auth = { userId: "123e4567-e89b-42d3-a456-426614174001", accessToken: "test-token", claims: {} };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use(createAiRouter(authenticate, (_request, _response, next) => next(), {
    repository,
    detectLanguage: () => "ru",
    lookupStandards: async () => ({ kind: "verified", standard }),
    generateResponse: async (prompt) => {
      aiPrompt = prompt;
      return "Проверенный ответ.";
    },
  }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "123e4567-e89b-42d3-a456-426614174002" },
      body: JSON.stringify({
        session_id: "123e4567-e89b-42d3-a456-426614174000",
        text: userPrompt,
        lang: "ru",
      }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(persistedUserPrompt, userPrompt);
  assert.match(aiPrompt, /\[VERIFIED KAZSTANDARD METADATA\]/u);
  assert.match(aiPrompt, /Source: https:\/\/new-shop\.ksm\.kz\/catalog\/document\/66007\//u);
  assert.doesNotMatch(aiPrompt, /Публичная аннотация|\.pdf/iu);
});
