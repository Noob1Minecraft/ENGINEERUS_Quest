import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { ChatRepository } from "../server/persistence/chats";
import { AiProviderError } from "../server/ai/groqClient";
import { buildEngineeringIntentPolicy } from "../server/ai/engineeringPolicy";
import { createAiRouter } from "../server/routes/ai";
import { loadServerEnv } from "../server/config/env";
import {
  MAX_KAZSTANDARD_HTML_BYTES,
  createKazStandardClient,
  type KazStandardClient,
} from "../server/standards/kazStandardClient";
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
import { extractStandardIdentifiers, guardStandardsResponse } from "../server/standards/standardsResponseGuard";
import { generateKazStandardQueries, rankKazStandardCandidates } from "../server/standards/standardsQuery";
import { buildVerifiedStandardsResponse } from "../server/standards/verifiedStandardsResponse";
import {
  createStandardsService,
  type StandardsLookupResult,
  type VerifiedStandard,
} from "../server/standards/standardsService";
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

async function exerciseGuardedGeneration(options: {
  userPrompt: string;
  lookupResult: StandardsLookupResult;
  generatedResponses: Array<string | Error>;
  language?: "ru" | "kk" | "en";
}) {
  const persistedResponses: string[] = [];
  const systemPolicies: string[] = [];
  const diagnostics: Array<Record<string, unknown>> = [];
  let persistedUserPrompt = "";
  let generateCalls = 0;
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
      persistedResponses.push(responseText);
      return {
        userMessage: { id: "user-message", sender: "user" as const, text: options.userPrompt, module: "tutor" as const, timestamp: "2026-08-20T00:00:00.000Z" },
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
    detectLanguage: () => options.language ?? "ru",
    lookupStandards: async () => options.lookupResult,
    generateResponse: async (_prompt, _module, language, systemPolicy) => {
      assert.equal(language, options.language ?? "ru");
      systemPolicies.push(systemPolicy ?? "");
      const response = options.generatedResponses[Math.min(generateCalls, options.generatedResponses.length - 1)];
      generateCalls += 1;
      if (response instanceof Error) throw response;
      return response;
    },
  }));

  const originalLog = console.log;
  console.log = (message?: unknown) => {
    if (typeof message !== "string") return;
    try {
      const entry = JSON.parse(message) as Record<string, unknown>;
      if (entry.event !== "standards_response_rejected") return;
      diagnostics.push({
        verifiedDesignationCount: entry.verified_designation_count,
        rejectedDesignationCount: entry.rejected_designation_count,
        regenerationAttempted: entry.regenerationAttempted,
        regenerationAccepted: entry.regenerationAccepted,
        deterministicFallbackUsed: entry.deterministicFallbackUsed,
        deterministicFallbackCandidateCount: entry.deterministicFallbackCandidateCount,
        ...(entry.providerFailureCategory ? { providerFailureCategory: entry.providerFailureCategory } : {}),
        ...(entry.providerStatus !== undefined ? { providerStatus: entry.providerStatus } : {}),
      });
    } catch {
      originalLog(message);
    }
  };
  let responseText = "";
  try {
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "123e4567-e89b-42d3-a456-426614174002" },
        body: JSON.stringify({
          session_id: "123e4567-e89b-42d3-a456-426614174000",
          text: options.userPrompt,
          lang: options.language ?? "ru",
        }),
      });
      assert.equal(response.status, 200);
      const body = await response.json() as { response: string };
      responseText = body.response;
    });
  } finally {
    console.log = originalLog;
  }

  return { diagnostics, generateCalls, persistedResponses, persistedUserPrompt, responseText, systemPolicies };
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
  assert.equal(isStandardsLookupWarranted("Какие нормы применяются к железобетонным конструкциям?"), true);
  assert.equal(isStandardsLookupWarranted("СНиП РК по сейсмостойкости зданий"), true);
});

test("preserves structural-steel intent in the first deterministic query", () => {
  assert.deepEqual(
    generateKazStandardQueries("Какой стандарт используется для конструкционных сталей?"),
    ["конструкционные стали", "сталь", "требования к материалам"],
  );
  assert.deepEqual(
    generateKazStandardQueries("Какие нормы применяются к железобетонным конструкциям?"),
    ["железобетонные конструкции", "железобетон"],
  );
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
  assert.deepEqual(
    generateKazStandardQueries("Действует ли СНиП РК 2.03-30-2017?"),
    ["СНиП РК 2.03-30-2017"],
  );
});

test("expands common engineering standards terminology deterministically", () => {
  const cases: Array<{ prompt: string; expected: string[] }> = [
    {
      prompt: "Какие ГОСТ устанавливают допуски и посадки для валов?",
      expected: ["допуски и посадки", "размеры предельные отклонения", "валы"],
    },
    {
      prompt: "Какой стандарт применяется к маркам стали и инженерным материалам?",
      expected: ["сталь", "требования к материалам"],
    },
    {
      prompt: "Какие стандарты регулируют сварку и сварные соединения?",
      expected: ["сварка", "сварные соединения"],
    },
    {
      prompt: "Какой ГОСТ применяется к бетонным конструкциям?",
      expected: ["бетон", "бетонные конструкции"],
    },
    {
      prompt: "Какие обязательные стандарты относятся к электробезопасности?",
      expected: ["электробезопасность", "безопасность электрооборудования"],
    },
    {
      prompt: "Какие требования стандартов относятся к безопасности машин?",
      expected: ["безопасность машин", "требования безопасности машин"],
    },
    {
      prompt: "Какой ГОСТ применяется к оформлению конструкторской документации ЕСКД?",
      expected: ["конструкторская документация", "ЕСКД", "оформление чертежей"],
    },
  ];

  for (const { prompt, expected } of cases) {
    const queries = generateKazStandardQueries(prompt);
    assert.deepEqual(queries, expected, prompt);
    assert.ok(queries.length <= 3, prompt);
  }
});

test("uses concise official-catalog queries for seismic standards questions", () => {
  assert.deepEqual(
    generateKazStandardQueries("Какие нормы СНиП РК регламентируют сейсмостойкость зданий в Алматы?"),
    ["сейсмостойкость зданий", "сейсмические районы", "сейсмические воздействия конструкции"],
  );
});

test("verifies a building-seismic synonym while rejecting a narrow hydroelectric result", async () => {
  const question = "Какие нормы СНиП РК регламентируют сейсмостойкость зданий в Алматы?";
  const attemptedQueries: string[] = [];
  const detailRequests: string[] = [];
  const client = fixtureClient({
    async searchKazStandard(query) {
      attemptedQueries.push(query);
      const candidates = query === "сейсмические районы"
        ? [{
            providerId: "57363",
            designation: "ГОСТ Р 55260.1.5-2012",
            title: "Гидроэлектростанции. Сооружения ГЭС гидротехнические. Требования к проектированию в сейсмических районах",
            status: "Действующий",
          }]
        : query === "сейсмические воздействия конструкции"
          ? [{
              providerId: "81234",
              designation: "СТ РК 8123-2026",
              title: "Строительные конструкции. Общие требования к расчету на сейсмические воздействия",
              status: "Действующий",
            }]
          : [];
      return { html: searchFixture(candidates), sourceUrl: `https://new-shop.ksm.kz/catalog/search/?q=${encodeURIComponent(query)}` };
    },
    async getKazStandardDocument(documentId) {
      detailRequests.push(documentId);
      assert.equal(documentId, "81234");
      return documentFixture(
        "81234",
        "СТ РК 8123-2026",
        "Строительные конструкции. Общие требования к расчету на сейсмические воздействия",
      );
    },
  });

  const result = await createStandardsService({ enabled: true, client }).searchVerifiedStandards(question);

  assert.deepEqual(attemptedQueries, [
    "сейсмостойкость зданий",
    "сейсмические районы",
    "сейсмические воздействия конструкции",
  ]);
  assert.deepEqual(detailRequests, ["81234"]);
  assert.equal(result.kind, "verified");
  if (result.kind !== "verified") return;
  assert.equal(result.standard.designation, "СТ РК 8123-2026");
  const response = buildVerifiedStandardsResponse(result, "ru") ?? "";
  assert.match(response, /СТ РК 8123-2026/u);
  assert.doesNotMatch(response, /ГОСТ Р 55260\.1\.5-2012/u);
});

test("does not promote seismic equipment records as building standards", () => {
  const question = "Какие нормы СНиП РК регламентируют сейсмостойкость зданий в Алматы?";
  const queries = generateKazStandardQueries(question);
  const candidates = parseKazStandardSearchResults(searchFixture([
    { providerId: "71533", designation: "ГОСТ 34611-2019", title: "Арматура трубопроводная. Методика проведения испытаний на сейсмостойкость", status: "Действующий" },
    { providerId: "67549", designation: "ГОСТ 33963-2016", title: "Котлы стационарные. Расчеты на сейсмическое и ветровое воздействия", status: "Действующий" },
    { providerId: "15471", designation: "ГОСТ 30546.2-98", title: "Испытания на сейсмостойкость машин, приборов и других технических изделий. Общие положения и методы испытаний", status: "Действующий" },
    { providerId: "36528", designation: "ISO 24314:2006", title: "Конструкционные стали для строительства с улучшенной сейсмостойкостью. Технические условия поставки", status: "Действующий" },
  ]));

  const ranked = rankKazStandardCandidates(candidates, question, queries);

  assert.equal(ranked.every(({ topicRelevant }) => topicRelevant === false), true);
  assert.equal(ranked.some(({ earlyStopEligible }) => earlyStopEligible), false);
});

test("does not generalize a hydroelectric seismic standard to ordinary buildings", () => {
  const question = "Какие нормы СНиП РК регламентируют сейсмостойкость зданий в Алматы?";
  const queries = generateKazStandardQueries(question);
  const [ranked] = rankKazStandardCandidates(parseKazStandardSearchResults(searchFixture([{
    providerId: "57363",
    designation: "ГОСТ Р 55260.1.5-2012",
    title: "Гидроэлектростанции. Сооружения ГЭС гидротехнические. Требования к проектированию в сейсмических районах",
    status: "Действующий",
  }])), question, queries);

  assert.equal(ranked.topicRelevant, false);
  assert.equal(ranked.earlyStopEligible, false);
});

test("covers additional engineering domains without exceeding three queries", () => {
  const prompts = [
    "Какие стандарты применяются к подшипникам качения?",
    "Какой ГОСТ регулирует зубчатые передачи?",
    "Какие стандарты относятся к крепежу и резьбовым соединениям?",
    "Какие требования стандартов применяются для защиты от коррозии?",
    "Какие стандарты относятся к железобетонным конструкциям?",
    "Какие стандарты применяются к электроустановкам?",
    "Какие требования действуют для оборудования под давлением?",
    "Какой стандарт применяется к трубопроводам?",
    "Какие стандарты регулируют метрологию и средства измерений?",
    "Какие стандарты применяются к техническим условиям?",
    "Какие требования относятся к эксплуатационной документации?",
  ];

  for (const prompt of prompts) {
    const queries = generateKazStandardQueries(prompt);
    assert.ok(queries.length >= 1, prompt);
    assert.ok(queries.length <= 3, prompt);
  }
});

test("ranks a general ESKD record above narrow applications for a broad documentation question", () => {
  const question = "Какой ГОСТ или СТ РК применяется к оформлению конструкторской документации?";
  const queries = generateKazStandardQueries(question);
  const candidates = parseKazStandardSearchResults(searchFixture([
    { providerId: "57001", designation: "ГОСТ 2.001-2013", title: "Единая система конструкторской документации. Общие положения", status: "Действующий" },
    { providerId: "38201", designation: "ГОСТ 2.125-2008", title: "ЕСКД. Правила выполнения эскизных конструкторских документов. Общие положения", status: "Действующий" },
    { providerId: "38204", designation: "ГОСТ 2.418-2008", title: "ЕСКД. Правила выполнения конструкторской документации упаковки", status: "Действующий" },
    { providerId: "38205", designation: "ГОСТ 2.431-2008", title: "ЕСКД. Правила выполнения чертежей изделий из стекла", status: "Действующий" },
  ]));
  const ranked = rankKazStandardCandidates(candidates, question, queries);

  assert.equal(ranked[0].candidate.designation, "ГОСТ 2.001-2013");
  assert.equal(ranked[0].earlyStopEligible, true);
  assert.ok(ranked[0].score > ranked.find(({ candidate }) => candidate.designation === "ГОСТ 2.418-2008")!.score);
  assert.ok(ranked[0].score > ranked.find(({ candidate }) => candidate.designation === "ГОСТ 2.431-2008")!.score);
  assert.ok(ranked[0].score > ranked.find(({ candidate }) => candidate.designation === "ГОСТ 2.125-2008")!.score);
});

test("allows a packaging-specific question to rank the packaging standard highly", () => {
  const question = "Какой стандарт ЕСКД применяется к конструкторской документации упаковки?";
  const queries = generateKazStandardQueries(question);
  const candidates = parseKazStandardSearchResults(searchFixture([
    { providerId: "57001", designation: "ГОСТ 2.001-2013", title: "Единая система конструкторской документации. Общие положения", status: "Действующий" },
    { providerId: "38204", designation: "ГОСТ 2.418-2008", title: "ЕСКД. Правила выполнения конструкторской документации упаковки", status: "Действующий" },
  ]));
  const ranked = rankKazStandardCandidates(candidates, question, queries);

  assert.equal(ranked[0].candidate.designation, "ГОСТ 2.418-2008");
  assert.equal(ranked[0].earlyStopEligible, true);
});

test("rejects verified-but-irrelevant pipeline and welded-joint cards for structural steel", () => {
  const question = "Какой стандарт используется для конструкционных сталей?";
  const queries = generateKazStandardQueries(question);
  const candidates = parseKazStandardSearchResults(searchFixture([
    { providerId: "4008", designation: "СТ РК 4008-2025", title: "Нефтегазовые трубопроводы. Механическое соединение стальных труб. Общие требования", status: "Действующий" },
    { providerId: "17635", designation: "ГОСТ ISO 17635-2018", title: "Неразрушающий контроль сварных соединений. Общие требования", status: "Действующий" },
    { providerId: "5640", designation: "ГОСТ 5640-2020", title: "Сталь. Конструкционные стали. Общие требования", status: "Действующий" },
  ]));
  const ranked = rankKazStandardCandidates(candidates, question, queries);

  assert.equal(ranked[0].candidate.designation, "ГОСТ 5640-2020");
  assert.equal(ranked[0].topicRelevant, true);
  assert.equal(ranked.find(({ candidate }) => candidate.providerId === "4008")?.topicRelevant, false);
  assert.equal(ranked.find(({ candidate }) => candidate.providerId === "17635")?.topicRelevant, false);
});

test("does not detail-verify or return structurally irrelevant steel candidates", async () => {
  let detailRequests = 0;
  const client = fixtureClient({
    async searchKazStandard() {
      return {
        html: searchFixture([
          { providerId: "4008", designation: "СТ РК 4008-2025", title: "Нефтегазовые трубопроводы. Механическое соединение стальных труб. Общие требования", status: "Действующий" },
          { providerId: "17635", designation: "ГОСТ ISO 17635-2018", title: "Неразрушающий контроль сварных соединений. Общие требования", status: "Действующий" },
        ]),
        sourceUrl: "https://new-shop.ksm.kz/catalog/search/?q=test",
      };
    },
    async getKazStandardDocument() {
      detailRequests += 1;
      throw new Error("irrelevant candidates must not be detail-verified");
    },
  });

  const result = await createStandardsService({ enabled: true, client }).searchVerifiedStandards(
    "Какой стандарт используется для конструкционных сталей?",
  );

  assert.equal(detailRequests, 0);
  assert.equal(result.kind, "no_result");
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

test("KazStandard client rejects redirects, including redirects to an unapproved host", async () => {
  const client = createKazStandardClient({
    fetchImpl: async () => new Response(null, {
      status: 302,
      headers: { Location: "https://example.invalid/catalog/document/1/" },
    }),
  });

  await assert.rejects(() => client.searchKazStandard("safe"), /redirect was refused/u);
});

test("KazStandard client accepts an exact-limit streamed HTML response", async () => {
  const html = "x".repeat(MAX_KAZSTANDARD_HTML_BYTES);
  const client = createKazStandardClient({
    fetchImpl: async () => new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": String(MAX_KAZSTANDARD_HTML_BYTES),
      },
    }),
  });

  const result = await client.searchKazStandard("safe");
  assert.equal(Buffer.byteLength(result.html, "utf8"), MAX_KAZSTANDARD_HTML_BYTES);
});

test("KazStandard client rejects oversized Content-Length before reading the body", async () => {
  let aborted = false;
  const client = createKazStandardClient({
    fetchImpl: async (_input, init) => {
      init?.signal?.addEventListener("abort", () => { aborted = true; }, { once: true });
      return new Response("small body", {
        status: 200,
        headers: {
          "Content-Type": "text/html",
          "Content-Length": String(MAX_KAZSTANDARD_HTML_BYTES + 1),
        },
      });
    },
  });

  await assert.rejects(() => client.searchKazStandard("oversized"), /size limit/u);
  assert.equal(aborted, true);
});

test("KazStandard client counts chunked bytes and aborts once the stream exceeds the limit", async () => {
  let aborted = false;
  let cancelled = false;
  const chunks = [new Uint8Array(1_000_000), new Uint8Array(1_000_000), new Uint8Array(1)];
  const client = createKazStandardClient({
    fetchImpl: async (_input, init) => {
      init?.signal?.addEventListener("abort", () => { aborted = true; }, { once: true });
      let index = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          // Deliberately remain open after the oversized third chunk so the
          // client cancellation is observable as an upstream cancel signal.
          controller.enqueue(chunks[Math.min(index++, chunks.length - 1)]);
        },
        cancel() { cancelled = true; },
      });
      return new Response(body, { status: 200, headers: { "Content-Type": "text/html" } });
    },
  });

  await assert.rejects(() => client.searchKazStandard("chunked"), /size limit/u);
  assert.equal(aborted, true);
  assert.equal(cancelled, true);
});

test("KazStandard timeout and safe upstream error mapping remain unchanged", async () => {
  const timeoutClient = createKazStandardClient({
    timeoutMs: 5,
    fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
  });
  await assert.rejects(() => timeoutClient.searchKazStandard("timeout"), (error: unknown) => {
    return error instanceof Error && error.name === "AbortError";
  });

  const nonHtmlClient = createKazStandardClient({
    fetchImpl: async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
  });
  await assert.rejects(() => nonHtmlClient.searchKazStandard("json"), /non-HTML/u);

  const failedClient = createKazStandardClient({
    fetchImpl: async () => new Response("unavailable", { status: 503, headers: { "Content-Type": "text/html" } }),
  });
  await assert.rejects(() => failedClient.searchKazStandard("failed"), /HTTP 503/u);
});

test("oversized KazStandard content never becomes verified metadata", async () => {
  const client = createKazStandardClient({
    fetchImpl: async () => new Response("x".repeat(MAX_KAZSTANDARD_HTML_BYTES + 1), {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }),
  });
  const result = await createStandardsService({ enabled: true, client })
    .searchVerifiedStandards("СТ РК ISO 9001-2016");
  assert.deepEqual(result, { kind: "unavailable" });
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

test("tries the second mapped query when the first has no useful candidates", async () => {
  const attemptedQueries: string[] = [];
  const client = fixtureClient({
    async searchKazStandard(query) {
      attemptedQueries.push(query);
      const candidates = query === "сварные соединения"
        ? [{ providerId: "72001", designation: "СТ РК 720-2026", title: "Сварные соединения. Общие требования", status: "Действующий" }]
        : [];
      return { html: searchFixture(candidates), sourceUrl: "https://new-shop.ksm.kz/catalog/search/?q=test" };
    },
    async getKazStandardDocument(documentId) {
      assert.equal(documentId, "72001");
      return documentFixture("72001", "СТ РК 720-2026", "Сварные соединения. Общие требования");
    },
  });

  const result = await createStandardsService({ enabled: true, client }).searchVerifiedStandards(
    "Какие стандарты регулируют сварку и сварные соединения?",
  );

  assert.deepEqual(attemptedQueries, ["сварка", "сварные соединения"]);
  assert.equal(result.kind, "verified");
});

test("runs the third query when earlier candidates are too narrow for the broad question", async () => {
  const attemptedQueries: string[] = [];
  let detailRequests = 0;
  const client = fixtureClient({
    async searchKazStandard(query) {
      attemptedQueries.push(query);
      const candidates = query === "конструкторская документация"
        ? [{ providerId: "38201", designation: "ГОСТ 2.125-2008", title: "ЕСКД. Эскизные конструкторские документы. Общие положения", status: "Действующий" }]
        : query === "ЕСКД"
          ? [{ providerId: "38204", designation: "ГОСТ 2.418-2008", title: "ЕСКД. Конструкторская документация упаковки", status: "Действующий" }]
          : [{ providerId: "57001", designation: "ГОСТ 2.001-2013", title: "Единая система конструкторской документации. Общие положения", status: "Действующий" }];
      return { html: searchFixture(candidates), sourceUrl: "https://new-shop.ksm.kz/catalog/search/?q=test" };
    },
    async getKazStandardDocument(documentId) {
      detailRequests += 1;
      assert.equal(documentId, "57001");
      return documentFixture("57001", "ГОСТ 2.001-2013", "Единая система конструкторской документации. Общие положения");
    },
  });

  const result = await createStandardsService({ enabled: true, client }).searchVerifiedStandards(
    "Какой ГОСТ или СТ РК применяется к оформлению конструкторской документации?",
  );

  assert.deepEqual(attemptedQueries, ["конструкторская документация", "ЕСКД", "оформление чертежей"]);
  assert.equal(detailRequests, 1);
  assert.equal(result.kind, "verified");
  if (result.kind === "verified") assert.equal(result.standard.designation, "ГОСТ 2.001-2013");
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

test("fails closed when no lookup result exists and the model introduces an identifier", () => {
  const result = guardStandardsResponse({
    content: "Применяется СП РК 2.03-01-2006.",
    userPrompt: "Какие нормы применяются к железобетонным конструкциям?",
    language: "ru",
  });

  assert.equal(result.rejected, true);
  assert.deepEqual(result.rejectedDesignations, ["СП РК 2.03-01-2006"]);
  assert.doesNotMatch(result.content, /2\.03-01-2006/u);
});

test("fails closed for disabled lookup while preserving generic and qualified user-supplied guidance", () => {
  const generic = guardStandardsResponse({
    content: "Можно объяснить общие требования к оформлению инженерной документации.",
    userPrompt: "Какие стандарты относятся к инженерной документации?",
    lookupResult: { kind: "disabled" },
    language: "ru",
  });
  assert.deepEqual(generic, {
    content: "Можно объяснить общие требования к оформлению инженерной документации.",
    rejected: false,
  });

  const introduced = guardStandardsResponse({
    content: "Для этого применяется СТ РК ISO 9999-2099.",
    userPrompt: "Какие стандарты относятся к инженерной документации?",
    lookupResult: { kind: "disabled" },
    language: "ru",
  });
  assert.equal(introduced.rejected, true);
  assert.deepEqual(introduced.rejectedDesignations, ["СТ РК ISO 9999-2099"]);
  assert.doesNotMatch(introduced.content, /9999-2099/u);
  assert.match(introduced.content, /не удалось проверить/u);

  const userSupplied = guardStandardsResponse({
    content: "Вы указали СТ РК ISO 9999-2099, но его статус не удалось подтвердить по официальному источнику.",
    userPrompt: "Что означает СТ РК ISO 9999-2099?",
    lookupResult: { kind: "disabled" },
    language: "ru",
  });
  assert.equal(userSupplied.rejected, false);
});

test("disabled lookup regenerates once and persists only a response without invented identifiers", async () => {
  const result = await exerciseGuardedGeneration({
    userPrompt: "Какой стандарт применяется к оформлению инженерной документации?",
    lookupResult: { kind: "disabled" },
    generatedResponses: [
      "Применяется СТ РК ISO 9999-2099.",
      "Можно объяснить общие требования к оформлению документации без неподтверждённых номеров.",
    ],
  });

  assert.equal(result.generateCalls, 2);
  assert.equal(result.persistedResponses.length, 1);
  assert.equal(result.responseText, result.persistedResponses[0]);
  assert.doesNotMatch(result.responseText, /9999-2099/u);
  assert.match(result.systemPolicies[1], /\[ALLOWED STANDARD IDENTIFIERS\]/u);
  assert.equal(result.diagnostics[0]?.rejectedDesignationCount, 1);
  assert.equal(result.diagnostics[0]?.verifiedDesignationCount, 0);
  assert.equal(result.diagnostics[0]?.regenerationAttempted, true);
  assert.equal(result.diagnostics[0]?.regenerationAccepted, true);
});

test("extracts complete Kazakh, regional, slash, multipart, and colon standard identifiers", () => {
  const identifiers = extractStandardIdentifiers([
    "ГОСТ Р 7.0.5-2008",
    "ГОСТ EN 1234-5:2020",
    "СП РК 2.03-01-2006",
    "ННД 1.04.08-2018",
    "NND 1.03.01-2018",
    "EN 1998-1:2004",
    "СТ РК ISO/IEC 17025-2019",
    "ҚР СТ 1234-2020",
    "ТР ЕАЭС 014/2011",
    "ТР ТС 032/2013",
  ].join("; ")).map(({ normalized }) => normalized);

  assert.deepEqual(identifiers, [
    "ГОСТ Р 7.0.5-2008",
    "ГОСТ EN 1234-5:2020",
    "СП РК 2.03-01-2006",
    "ННД 1.04.08-2018",
    "NND 1.03.01-2018",
    "EN 1998-1:2004",
    "СТ РК ISO/IEC 17025-2019",
    "ҚР СТ 1234-2020",
    "ТР ЕАЭС 014/2011",
    "ТР ТС 032/2013",
  ]);
});

test("no_result blocks every guarded normative family while leaving ordinary engineering numbers alone", () => {
  const invented = [
    "ННД 1.04.08-2018",
    "СНиП РК 2.03-30-2099",
    "СП РК 2.03-01-2099",
    "СТ РК 9999-2099",
    "ГОСТ Р 7.0.5-2099",
    "ISO 9999-2099",
    "EN 1998-1:2099",
  ];
  for (const designation of invented) {
    const result = guardStandardsResponse({
      content: `Для проекта применяется ${designation}.`,
      userPrompt: "Какие нормы регламентируют сейсмостойкость здания?",
      lookupResult: { kind: "no_result" },
      language: "ru",
    });
    assert.equal(result.rejected, true, designation);
    assert.deepEqual(result.rejectedDesignations, [designation]);
  }

  const ordinary = guardStandardsResponse({
    content: "Расчётная нагрузка составляет 20 кН, момент — 42 Н·м, ускорение — 0.3g, а обследование выполнено в 2018 году.",
    userPrompt: "Дайте общее инженерное пояснение без ссылки на стандарт.",
    lookupResult: { kind: "no_result" },
    language: "ru",
  });
  assert.equal(ordinary.rejected, false);
});

test("no_result identifier enforcement is language-independent", () => {
  for (const language of ["ru", "kk", "en"] as const) {
    const result = guardStandardsResponse({
      content: "NND 1.04.08-2018 is mandatory.",
      userPrompt: language === "kk" ? "Қандай нормалар қолданылады?" : language === "en" ? "Which rules apply?" : "Какие нормы применяются?",
      lookupResult: { kind: "no_result" },
      language,
    });
    assert.equal(result.rejected, true);
    assert.doesNotMatch(result.content, /1\.04\.08-2018/u);
  }
});

test("fails closed when a no-result response invents a numbered SNiP or SN RK document", () => {
  for (const invented of ["СНиП РК 2.03-30-2099", "СН РК 2.03-01-2099"]) {
    const result = guardStandardsResponse({
      content: `Для проекта применяется ${invented}.`,
      userPrompt: "Какие нормы применяются к сейсмостойкости зданий?",
      lookupResult: { kind: "no_result" },
      language: "ru",
    });

    assert.equal(result.rejected, true);
    assert.deepEqual(result.rejectedDesignations, [invented]);
    assert.doesNotMatch(result.content, /2\.03/u);
  }
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
  assert.match(result.content, /проверены поисковые понятия/u);
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
    assert.match(result.content, /(?:поисковые понятия|іздеу ұғымдары|search concepts)/iu);
    assert.ok(result.content.endsWith(testCase.content));
  }
});

test("exact seismic-building no_result reports bounded search concepts without inventing identifiers", () => {
  const userPrompt = "Какие нормы СНиП РК регламентируют сейсмостойкость зданий в Алматы?";
  const result = guardStandardsResponse({
    content: "В общем случае необходимо определить расчетную сейсмическую модель, категорию ответственности и исходные данные площадки.",
    userPrompt,
    lookupResult: { kind: "no_result" },
    language: "ru",
  });

  assert.equal(result.rejected, false);
  assert.match(result.content, /«сейсмостойкость зданий»/u);
  assert.match(result.content, /«сейсмические районы»/u);
  assert.match(result.content, /«сейсмические воздействия конструкции»/u);
  assert.doesNotMatch(result.content, /(?:ГОСТ|СТ\s+РК|ННД|СНиП|СП\s+РК)\s+\d/iu);
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
      return "Сведения сверены с СТ РК ISO 9001-2016.";
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
  assert.equal(aiSystemPolicy, [
    buildEngineeringIntentPolicy("ENGINEERING_STANDARD"),
    buildStandardsSystemInstructions({ kind: "verified", standard }),
  ].join("\n\n"));
  assert.doesNotMatch(persistedUserPrompt, /VERIFIED KAZSTANDARD METADATA/u);
  assert.match(persistedAssistantResponse, /СТ РК ISO 9001-2016/u);
});

test("returns an accepted first response without regeneration or deterministic fallback", async () => {
  const standard: VerifiedStandard = {
    providerId: "57001",
    designation: "ГОСТ 2.001-2013",
    title: "Единая система конструкторской документации. Общие положения",
    status: "Действующий",
    sourceUrl: "https://new-shop.ksm.kz/catalog/document/57001/",
    currency: "current",
    verifiedAt: "2026-08-22T00:00:00.000Z",
  };
  const generatedResponse = "По открытому каталогу найден ГОСТ 2.001-2013.";
  const result = await exerciseGuardedGeneration({
    userPrompt: "Какой ГОСТ применяется к оформлению конструкторской документации?",
    lookupResult: { kind: "verified", standard },
    generatedResponses: [generatedResponse],
  });

  assert.equal(result.generateCalls, 1);
  assert.equal(result.responseText, generatedResponse);
  assert.deepEqual(result.persistedResponses, [generatedResponse]);
  assert.deepEqual(result.diagnostics, []);
});

test("regenerates exactly once with a strict allowlist and persists only the accepted response", async () => {
  const standard: VerifiedStandard = {
    providerId: "57001",
    designation: "ГОСТ 2.001-2013",
    title: "Единая система конструкторской документации. Общие положения",
    status: "Действующий",
    sourceUrl: "https://new-shop.ksm.kz/catalog/document/57001/",
    currency: "current",
    verifiedAt: "2026-08-22T00:00:00.000Z",
  };
  const result = await exerciseGuardedGeneration({
    userPrompt: "Какой ГОСТ применяется к оформлению конструкторской документации?",
    lookupResult: { kind: "verified", standard },
    generatedResponses: [
      "Применимы ГОСТ 2.001-2013 и ГОСТ 9.999-2099.",
      "По открытому каталогу подтверждён ГОСТ 2.001-2013; остальные требования следует проверять отдельно.",
    ],
  });

  assert.equal(result.generateCalls, 2);
  assert.equal(result.persistedResponses.length, 1);
  assert.equal(result.persistedResponses[0], result.responseText);
  assert.match(result.persistedResponses[0], /ГОСТ 2\.001-2013/u);
  assert.doesNotMatch(result.persistedResponses[0], /9\.999-2099/u);
  assert.doesNotMatch(result.persistedUserPrompt, /VERIFIED KAZSTANDARD METADATA/u);
  assert.match(result.systemPolicies[1], /\[ALLOWED STANDARD IDENTIFIERS\][\s\S]*ГОСТ 2\.001-2013/u);
  assert.doesNotMatch(result.systemPolicies[1], /9\.999-2099/u);
  assert.deepEqual(result.diagnostics, [{
    verifiedDesignationCount: 1,
    rejectedDesignationCount: 1,
    regenerationAttempted: true,
    regenerationAccepted: true,
    deterministicFallbackUsed: false,
    deterministicFallbackCandidateCount: 0,
  }]);
});

test("uses three verified metadata records after one regeneration still invents another identifier", async () => {
  const candidates: VerifiedStandard[] = [
    {
      providerId: "57001",
      designation: "ГОСТ 2.001-2013",
      title: "Единая система конструкторской документации. Общие положения",
      status: "Действующий",
      sourceUrl: "https://new-shop.ksm.kz/catalog/document/57001/",
      currency: "current",
      verifiedAt: "2026-08-22T00:00:00.000Z",
    },
    {
      providerId: "57002",
      designation: "ГОСТ 2.002-2013",
      title: "Проверенный документ 2",
      status: "Действующий",
      sourceUrl: "https://new-shop.ksm.kz/catalog/document/57002/",
      currency: "current",
      verifiedAt: "2026-08-22T00:00:00.000Z",
    },
    {
      providerId: "57003",
      designation: "ГОСТ 2.003-2013",
      title: "Проверенный документ 3",
      status: "Действующий",
      sourceUrl: "https://new-shop.ksm.kz/catalog/document/57003/",
      currency: "current",
      verifiedAt: "2026-08-22T00:00:00.000Z",
    },
  ];
  const result = await exerciseGuardedGeneration({
    userPrompt: "Какой ГОСТ применяется к оформлению конструкторской документации?",
    lookupResult: { kind: "ambiguous", candidates },
    generatedResponses: [
      "Применимы ГОСТ 2.001-2013 и ГОСТ 9.999-2099.",
      "Также применяется ГОСТ 8.888-2099.",
    ],
  });

  assert.equal(result.generateCalls, 2);
  assert.equal(result.persistedResponses.length, 1);
  assert.equal(result.persistedResponses[0], result.responseText);
  assert.doesNotMatch(result.persistedResponses[0], /9\.999-2099|8\.888-2099/u);
  assert.match(result.persistedResponses[0], /ГОСТ 2\.001-2013/u);
  assert.match(result.persistedResponses[0], /ГОСТ 2\.002-2013/u);
  assert.match(result.persistedResponses[0], /ГОСТ 2\.003-2013/u);
  assert.match(result.persistedResponses[0], /https:\/\/new-shop\.ksm\.kz\/catalog\/document\/57001\//u);
  assert.match(result.persistedResponses[0], /Полный текст стандартов не анализировался/u);
  assert.deepEqual(result.diagnostics, [{
    verifiedDesignationCount: 3,
    rejectedDesignationCount: 2,
    regenerationAttempted: true,
    regenerationAccepted: false,
    deterministicFallbackUsed: true,
    deterministicFallbackCandidateCount: 3,
  }]);
});

test("builds deterministic verified responses in Russian, Kazakh, and English", () => {
  const candidates: VerifiedStandard[] = [
    {
      providerId: "57001",
      designation: "ГОСТ 2.001-2013",
      title: "Единая система конструкторской документации. Общие положения",
      status: "Действующий",
      effectiveDate: "2014-06-01",
      sourceUrl: "https://new-shop.ksm.kz/catalog/document/57001/",
      currency: "current",
      verifiedAt: "2026-08-22T00:00:00.000Z",
    },
    ...[2, 3, 4].map((number): VerifiedStandard => ({
      providerId: `5700${number}`,
      designation: `ГОСТ 2.00${number}-2013`,
      title: `Проверенный документ ${number}`,
      status: "Действующий",
      sourceUrl: `https://new-shop.ksm.kz/catalog/document/5700${number}/`,
      currency: "current",
      verifiedAt: "2026-08-22T00:00:00.000Z",
    })),
  ];
  const result: StandardsLookupResult = { kind: "ambiguous", candidates };

  const russian = buildVerifiedStandardsResponse(result, "ru") ?? "";
  const kazakh = buildVerifiedStandardsResponse(result, "kk") ?? "";
  const english = buildVerifiedStandardsResponse(result, "en") ?? "";

  assert.match(russian, /^По открытому каталогу КазСтандарта/u);
  assert.match(kazakh, /^ҚазСтандарттың ашық каталогынан/u);
  assert.match(english, /^The following relevant documents/u);
  for (const content of [russian, kazakh, english]) {
    assert.match(content, /ГОСТ 2\.001-2013/u);
    assert.match(content, /https:\/\/new-shop\.ksm\.kz\/catalog\/document\/57001\//u);
    assert.doesNotMatch(content, /ГОСТ 2\.004-2013|\/57004\//u);
    assert.equal((content.match(/^- /gmu) ?? []).length, 3);
  }
});

test("keeps the existing no-result fallback when no verified candidates exist", async () => {
  const result = await exerciseGuardedGeneration({
    userPrompt: "Какой стандарт применяется к конструкторской документации?",
    lookupResult: { kind: "no_result" },
    generatedResponses: [
      "Применяется ГОСТ 9.999-2099.",
      "Также применяется ГОСТ 8.888-2099.",
    ],
  });

  assert.equal(result.generateCalls, 2);
  assert.equal(result.persistedResponses.length, 1);
  assert.equal(result.persistedResponses[0], result.responseText);
  assert.doesNotMatch(result.responseText, /9\.999-2099|8\.888-2099/u);
  assert.match(result.responseText, /не удалось подтвердить конкретный действующий стандарт/u);
  assert.deepEqual(result.diagnostics, [{
    verifiedDesignationCount: 0,
    rejectedDesignationCount: 2,
    regenerationAttempted: true,
    regenerationAccepted: false,
    deterministicFallbackUsed: false,
    deterministicFallbackCandidateCount: 0,
  }]);
});

test("uses deterministic verified metadata when guarded regeneration is rate-limited", async () => {
  const standard: VerifiedStandard = {
    providerId: "57001",
    designation: "ГОСТ 2.001-2013",
    title: "Единая система конструкторской документации. Общие положения",
    status: "Действующий",
    sourceUrl: "https://new-shop.ksm.kz/catalog/document/57001/",
    currency: "current",
    verifiedAt: "2026-08-22T00:00:00.000Z",
  };
  const result = await exerciseGuardedGeneration({
    userPrompt: "Какой ГОСТ применяется к оформлению конструкторской документации?",
    lookupResult: { kind: "verified", standard },
    generatedResponses: [
      "Применимы ГОСТ 2.001-2013 и ГОСТ 9.999-2099.",
      new AiProviderError("rate_limit", "Не удалось получить ответ от ИИ. Повторите попытку.", 429),
    ],
  });

  assert.equal(result.generateCalls, 2);
  assert.equal(result.persistedResponses.length, 1);
  assert.match(result.responseText, /ГОСТ 2\.001-2013/u);
  assert.doesNotMatch(result.responseText, /9\.999-2099|Не удалось получить ответ от ИИ/u);
  assert.deepEqual(result.diagnostics, [{
    verifiedDesignationCount: 1,
    rejectedDesignationCount: 1,
    regenerationAttempted: true,
    regenerationAccepted: false,
    deterministicFallbackUsed: true,
    deterministicFallbackCandidateCount: 1,
    providerFailureCategory: "rate_limit",
    providerStatus: 429,
  }]);
});

test("keeps the localized safe fallback when regeneration is rate-limited without verified candidates", async () => {
  const result = await exerciseGuardedGeneration({
    userPrompt: "Какой стандарт применяется к безопасности машин?",
    lookupResult: { kind: "no_result" },
    generatedResponses: [
      "Применяется ГОСТ 9.999-2099.",
      new AiProviderError("rate_limit", "Не удалось получить ответ от ИИ. Повторите попытку.", 429),
    ],
  });

  assert.equal(result.generateCalls, 2);
  assert.match(result.responseText, /не удалось подтвердить/u);
  assert.doesNotMatch(result.responseText, /9\.999-2099|Не удалось получить ответ от ИИ/u);
  assert.equal(result.diagnostics[0]?.regenerationAccepted, false);
  assert.equal(result.diagnostics[0]?.providerFailureCategory, "rate_limit");
});
