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
  buildStandardsSystemInstructions,
  buildVerifiedStandardsContext,
  isStandardsLookupWarranted,
  preparePromptWithStandardsMetadata,
} from "../server/standards/standardsPolicy";
import { guardStandardsResponse } from "../server/standards/standardsResponseGuard";
import { generateKazStandardQueries } from "../server/standards/standardsQuery";
import { createStandardsService, type VerifiedStandard } from "../server/standards/standardsService";
import { withServer } from "./helpers";

const SEARCH_HTML = readFileSync(new URL("./fixtures/kazstandard-search.html", import.meta.url), "utf8");
const DOCUMENT_HTML = readFileSync(new URL("./fixtures/kazstandard-document.html", import.meta.url), "utf8");
const DOCUMENT_URL = "https://new-shop.ksm.kz/catalog/document/66007/";

function searchFixture(candidates: Array<{
  providerId: string;
  designation: string;
  title: string;
  status?: string;
}>): string {
  if (candidates.length === 0) return "<html><body>Документы не найдены</body></html>";
  return `<html><body>${candidates.map((candidate) => `
    <div class="prod-card"><a href="/catalog/document/${candidate.providerId}/" class="prod-top">
      ${candidate.status ? `<span class="prod-badge">${candidate.status}</span>` : ""}
      <div class="prod-code">${candidate.designation}</div>
      <div class="prod-title">${candidate.title}</div>
    </a></div>
  `).join("")}</body></html>`;
}

function documentFixture(providerId: string, designation: string, title: string, status = "Действующий") {
  return {
    html: `<h1 class="detail-code">${designation}</h1><span class="prod-badge">${status}</span><h2 class="detail-title">${title}</h2>`,
    sourceUrl: `https://new-shop.ksm.kz/catalog/document/${providerId}/`,
  };
}

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

test("expands a general design-documentation question into at most three deterministic queries", () => {
  const queries = generateKazStandardQueries(
    "Какой ГОСТ или СТ РК применяется к оформлению конструкторской документации?",
  );
  assert.deepEqual(queries, [
    "конструкторская документация",
    "ЕСКД",
    "оформление чертежей",
  ]);
  assert.ok(queries.length <= 3);
});

test("keeps an exact standard designation unchanged and first", () => {
  assert.deepEqual(
    generateKazStandardQueries("Какие требования содержит ГОСТ 2.102-68?"),
    ["ГОСТ 2.102-68"],
  );
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
  assert.deepEqual(await preparePromptWithStandardsMetadata(conceptual, enabled.searchVerifiedStandards), { prompt: conceptual });
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
  const result = await createStandardsService({ enabled: true, client }).searchVerifiedStandards("ISO 9001");

  assert.equal(result.kind, "ambiguous");
  if (result.kind === "ambiguous") {
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].currency, "current");
    assert.equal(result.candidates[1].currency, "non_current");
  }
});

test("deduplicates candidates across expanded searches and verifies a detail page only once", async () => {
  const queries: string[] = [];
  let detailRequests = 0;
  const duplicateCard = searchFixture([{
    providerId: "70001",
    designation: "СТ РК 700-2026",
    title: "Техническая документация",
  }]);
  const client = fixtureClient({
    async searchKazStandard(query) {
      queries.push(query);
      return { html: duplicateCard, sourceUrl: "https://new-shop.ksm.kz/catalog/search/?q=test" };
    },
    async getKazStandardDocument() {
      detailRequests += 1;
      return documentFixture("70001", "СТ РК 700-2026", "Техническая документация");
    },
  });

  const result = await createStandardsService({ enabled: true, client }).searchVerifiedStandards(
    "Какой ГОСТ или СТ РК применяется к оформлению конструкторской документации?",
  );

  assert.equal(queries.length, 3);
  assert.equal(detailRequests, 1);
  assert.equal(result.kind, "verified");
});

test("caps detail-page validation at three ranked candidates", async () => {
  let detailRequests = 0;
  const candidates = ["71001", "71002", "71003", "71004"].map((providerId, index) => ({
    providerId,
    designation: `СТ РК ${710 + index}-2026`,
    title: `Техническая документация ${index + 1}`,
  }));
  const client = fixtureClient({
    async searchKazStandard() {
      return { html: searchFixture(candidates), sourceUrl: "https://new-shop.ksm.kz/catalog/search/?q=test" };
    },
    async getKazStandardDocument(documentId) {
      detailRequests += 1;
      const candidate = candidates.find(({ providerId }) => providerId === documentId);
      assert.ok(candidate);
      return documentFixture(candidate.providerId, candidate.designation, candidate.title);
    },
  });

  const result = await createStandardsService({ enabled: true, client }).searchVerifiedStandards(
    "Какие стандарты относятся к технической документации?",
  );

  assert.equal(detailRequests, 3);
  assert.equal(result.kind, "ambiguous");
  if (result.kind === "ambiguous") assert.equal(result.candidates.length, 3);
});

test("requires a successfully parsed detail page before a search candidate is verified", async () => {
  let searches = 0;
  let details = 0;
  const strongCard = searchFixture([{
    providerId: "70002",
    designation: "СТ РК 701-2026",
    title: "Конструкторская документация",
    status: "Действующий",
  }]);
  const client = fixtureClient({
    async searchKazStandard() {
      searches += 1;
      return { html: strongCard, sourceUrl: "https://new-shop.ksm.kz/catalog/search/?q=test" };
    },
    async getKazStandardDocument() {
      details += 1;
      return {
        html: "<html><body>unexpected detail markup</body></html>",
        sourceUrl: "https://new-shop.ksm.kz/catalog/document/70002/",
      };
    },
  });

  const result = await createStandardsService({ enabled: true, client }).searchVerifiedStandards(
    "Какой стандарт применяется к конструкторской документации?",
  );

  assert.equal(searches, 3);
  assert.equal(details, 1);
  assert.equal(result.kind, "unavailable");
});

test("returns no_result only after all generated queries return no candidates", async () => {
  const queries: string[] = [];
  let details = 0;
  const client = fixtureClient({
    async searchKazStandard(query) {
      queries.push(query);
      return { html: searchFixture([]), sourceUrl: "https://new-shop.ksm.kz/catalog/search/?q=test" };
    },
    async getKazStandardDocument() {
      details += 1;
      throw new Error("must not validate absent candidates");
    },
  });

  const result = await createStandardsService({ enabled: true, client }).searchVerifiedStandards(
    "Какой ГОСТ или СТ РК применяется к оформлению конструкторской документации?",
  );

  assert.deepEqual(queries, ["конструкторская документация", "ЕСКД", "оформление чертежей"]);
  assert.equal(details, 0);
  assert.equal(result.kind, "no_result");
});

test("builds a bounded verified metadata block for the AI without full document content", async () => {
  const standard: VerifiedStandard = {
    ...parseKazStandardDocument(DOCUMENT_HTML, DOCUMENT_URL),
    currency: "current",
    verifiedAt: "2026-08-20T00:00:00.000Z",
  };
  const prompt = "Что требует СТ РК ISO 9001-2016?";
  let lookupCalls = 0;
  const prepared = await preparePromptWithStandardsMetadata(prompt, async () => {
    lookupCalls += 1;
    return { kind: "verified", standard };
  });

  assert.equal(lookupCalls, 1);
  assert.match(prepared.prompt, /\[VERIFIED KAZSTANDARD METADATA\]/u);
  assert.match(prepared.prompt, /Source: https:\/\/new-shop\.ksm\.kz\/catalog\/document\/66007\//u);
  assert.doesNotMatch(prepared.prompt, /Treat all catalog fields|catalog metadata only/u);
  assert.match(prepared.systemInstructions ?? "", /public catalog metadata only/u);
  assert.doesNotMatch(prepared.prompt, /Публичная аннотация|\.pdf/iu);
  assert.equal(buildVerifiedStandardsContext({ kind: "disabled" }), undefined);
});

test("fails safely when the metadata lookup is unavailable", async () => {
  const prepared = await preparePromptWithStandardsMetadata(
    "Какой ГОСТ применяется к этому чертежу?",
    async () => { throw new Error("catalog unavailable"); },
  );
  assert.match(prepared.prompt, /Lookup status: unavailable/u);
  assert.match(prepared.systemInstructions ?? "", /introduce no specific standard identifier/u);
});

test("rejects invented identifiers when lookup found no matching standard", () => {
  const result = guardStandardsResponse({
    content: "Для этого применяется СТ РК ISO 9999-2099.",
    userPrompt: "Какой ГОСТ или СТ РК применяется к оформлению конструкторской документации?",
    lookupResult: { kind: "no_result" },
    language: "ru",
  });

  assert.equal(result.rejected, true);
  assert.doesNotMatch(result.content, /9999-2099/u);
  assert.match(result.content, /не удалось подтвердить/u);
  assert.match(result.content, /ЕСКД/u);
  assert.match(result.content, /чертежам|форматам|обозначениям/u);
});

test("keeps useful generic guidance for no_result and adds the verification limitation", () => {
  const result = guardStandardsResponse({
    content: "В общем случае используйте принципы ЕСКД: проверьте оформление чертежей, форматы, обозначения и состав документации.",
    userPrompt: "Как оформлять конструкторскую документацию?",
    lookupResult: { kind: "no_result" },
    language: "ru",
  });

  assert.equal(result.rejected, false);
  assert.match(result.content, /^По открытому каталогу КазСтандарта не удалось подтвердить/u);
  assert.match(result.content, /принципы ЕСКД/u);
  assert.doesNotMatch(result.content, /(?:ГОСТ|СТ\s+РК|ЕСКД)\s+\d/u);
});

test("keeps no_result guidance and verification limitations in the resolved language", () => {
  const cases = [
    {
      language: "ru" as const,
      userPrompt: "Какие требования относятся к технической документации?",
      content: "Можно рассмотреть общие требования к составу и оформлению документации.",
      limitation: /не удалось подтвердить/u,
    },
    {
      language: "kk" as const,
      userPrompt: "Техникалық құжаттамаға қандай талаптар қолданылады?",
      content: "Құжаттардың құрамы мен рәсімделуіне қойылатын жалпы талаптарды қарастыруға болады.",
      limitation: /растау мүмкін болмады/u,
    },
    {
      language: "en" as const,
      userPrompt: "Which requirements apply to technical documentation?",
      content: "General requirements for document composition and presentation can still be explained.",
      limitation: /did not verify/u,
    },
  ];

  for (const testCase of cases) {
    const result = guardStandardsResponse({
      content: testCase.content,
      userPrompt: testCase.userPrompt,
      lookupResult: { kind: "no_result" },
      language: testCase.language,
    });
    assert.equal(result.rejected, false);
    assert.match(result.content, testCase.limitation);
    assert.ok(result.content.endsWith(testCase.content));
  }
});

test("allows an exact verified designation but rejects an additional invented standard", () => {
  const verified: VerifiedStandard = {
    providerId: "2102",
    designation: "ГОСТ 2.102-68",
    title: "Виды и комплектность конструкторских документов",
    status: "Действующий",
    sourceUrl: "https://new-shop.ksm.kz/catalog/document/2102/",
    currency: "current",
    verifiedAt: "2026-08-20T00:00:00.000Z",
  };
  const allowed = guardStandardsResponse({
    content: "В открытом каталоге найден ГОСТ 2.102-68.",
    userPrompt: "Какой стандарт относится к комплектности документов?",
    lookupResult: { kind: "verified", standard: verified },
    language: "ru",
  });
  assert.deepEqual(allowed, {
    content: "В открытом каталоге найден ГОСТ 2.102-68.",
    rejected: false,
  });

  const rejected = guardStandardsResponse({
    content: "Применимы ГОСТ 2.102-68 и СТ РК ISO 9999-2099.",
    userPrompt: "Какой стандарт относится к комплектности документов?",
    lookupResult: { kind: "verified", standard: verified },
    language: "ru",
  });
  assert.equal(rejected.rejected, true);
  assert.doesNotMatch(rejected.content, /ГОСТ 2\.102-68|9999-2099/u);
});

test("allows qualified discussion of a user-provided identifier but rejects an unverified current claim", () => {
  const userPrompt = "Что означает СТ РК ISO 9999-2099?";
  const qualified = guardStandardsResponse({
    content: "Вы указали СТ РК ISO 9999-2099, но его статус не удалось подтвердить по открытому каталогу.",
    userPrompt,
    lookupResult: { kind: "no_result" },
    language: "ru",
  });
  assert.equal(qualified.rejected, false);

  const unsupportedClaim = guardStandardsResponse({
    content: "СТ РК ISO 9999-2099 — действующий и подтверждённый стандарт.",
    userPrompt,
    lookupResult: { kind: "no_result" },
    language: "ru",
  });
  assert.equal(unsupportedClaim.rejected, true);
  assert.doesNotMatch(unsupportedClaim.content, /9999-2099/u);
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
  let aiSystemPolicy = "";
  let persistedAssistantResponse = "";
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
      persistedAssistantResponse = responseText;
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
    generateResponse: async (prompt, _module, language, systemPolicy) => {
      aiPrompt = prompt;
      aiSystemPolicy = systemPolicy ?? "";
      assert.equal(language, "ru");
      return "Сведения сверены с ГОСТ 2.102-68.";
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
  assert.equal(aiSystemPolicy, buildStandardsSystemInstructions({ kind: "verified", standard }));
  assert.doesNotMatch(persistedUserPrompt, /VERIFIED KAZSTANDARD METADATA/u);
  assert.doesNotMatch(persistedAssistantResponse, /ГОСТ 2\.102-68/u);
  assert.match(persistedAssistantResponse, /не удалось подтвердить все конкретные стандарты/u);
});
