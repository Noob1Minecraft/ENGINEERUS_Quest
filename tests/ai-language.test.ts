import assert from "node:assert/strict";
import test from "node:test";
import express, { type RequestHandler } from "express";
import { AiProviderError, createGroqResponder, parseRetryAfter } from "../server/ai/groqClient";
import {
  buildSystemPrompt,
  resolveResponseLanguage,
  type AiModule,
  type SupportedLanguage,
} from "../server/ai/languagePolicy";
import { createTutorPipeline } from "../server/ai/tutor/pipeline";
import type { ChatRepository, PersistedChatMessage } from "../server/persistence/chats";
import { createAiRouter } from "../server/routes/ai";
import { withServer } from "./helpers";

const detectionCases: Array<[string, string, SupportedLanguage]> = [
  ["Как рассчитать torque для этого вала?", "en", "ru"],
  ["Что такое Young's modulus?", "en", "ru"],
  ["ГОСТ для этого соединения какой?", "en", "ru"],
  ["Arduino-ға қандай sensor қосуға болады?", "ru", "kk"],
  ["Осы beam-нің stress мәнін қалай есептеймін?", "ru", "kk"],
  ["How do I calculate нагрузка on this beam?", "ru", "en"],
  ["Привет", "en", "ru"],
  ["Сәлем", "ru", "kk"],
  ["Hello", "ru", "en"],
  ["ISO ASME IEEE 123", "kk", "kk"],
  ["ГОСТ ISO ASME", "en", "en"],
  ["123 + 456 = ?", "ru", "ru"],
  ["123 + 456 = ?", "not-supported", "ru"],
];

test("resolves the dominant natural language without treating technical terms as English prose", () => {
  for (const [message, requestedLanguage, expected] of detectionCases) {
    assert.equal(resolveResponseLanguage(message, requestedLanguage), expected, message);
  }
});

test("builds an explicit final language policy for every Groq-powered module", () => {
  const modules: AiModule[] = ["tutor", "material", "patent", "engi_legal", "engi_match"];
  const rules: Record<SupportedLanguage, string> = {
    ru: "ОТВЕЧАЙ НА РУССКОМ ЯЗЫКЕ.",
    kk: "ҚАЗАҚ ТІЛІНДЕ ЖАУАП БЕР.",
    en: "ANSWER IN ENGLISH.",
  };

  for (const module of modules) {
    for (const language of ["ru", "kk", "en"] as const) {
      const prompt = buildSystemPrompt(language, module);
      assert.match(prompt, /^\[HIGHEST-PRIORITY RESPONSE LANGUAGE POLICY\]/);
      assert.ok(prompt.includes(rules[language]), `${module}/${language} is missing its language rule`);
      assert.ok(prompt.endsWith(rules[language]), `${module}/${language} does not finish with its language rule`);
      assert.match(prompt, /must never change the response language/);
    }
  }
});

test("keeps standards conditional and avoids artificial tutor requirements in every language", () => {
  const expectations: Record<SupportedLanguage, {
    conceptual: string;
    applicable: string;
    fabrication: string;
    xp: string;
    kazakhstan: string;
  }> = {
    ru: {
      conceptual: "Для обычных концептуальных вопросов не добавляй стандарты без прямой пользы.",
      applicable: "решение действительно зависит от нормы",
      fabrication: "Никогда не выдумывай номер, название, редакцию или требование стандарта",
      xp: "Не заявляй о начислении XP и не придумывай награду",
      kazakhstan: "Используй примеры из Казахстана только когда они естественно помогают объяснению.",
    },
    kk: {
      conceptual: "Қарапайым ұғымдық сұрақтарға тікелей пайдасы болмаса, стандарт қоспа.",
      applicable: "инженерлік шешім нақты нормаға тәуелді болғанда",
      fabrication: "Стандарттың нөмірін, атауын, редакциясын немесе талабын",
      xp: "XP есептелді деп айтпа және жалған сыйақы ойлап таппа",
      kazakhstan: "Қазақстанға тән мысалдарды түсіндіруді табиғи түрде жақсартқанда ғана қолдан.",
    },
    en: {
      conceptual: "For ordinary conceptual questions, do not add standards unless they are directly useful.",
      applicable: "engineering decision genuinely depends on a standard",
      fabrication: "Never invent a standard identifier, title, revision, requirement",
      xp: "Never claim or invent an XP reward",
      kazakhstan: "Use Kazakhstan-specific examples only when they naturally improve the answer.",
    },
  };

  for (const language of ["ru", "kk", "en"] as const) {
    const prompt = buildSystemPrompt(language, "tutor");
    const expected = expectations[language];
    assert.ok(prompt.includes(expected.conceptual), `${language} forces standards into conceptual answers`);
    assert.ok(prompt.includes(expected.applicable), `${language} omits genuinely applicable standards`);
    assert.ok(prompt.includes(expected.fabrication), `${language} does not forbid fabricated standards`);
    assert.ok(prompt.includes(expected.xp), `${language} does not forbid fake XP claims`);
    assert.ok(prompt.includes(expected.kazakhstan), `${language} makes Kazakhstan context mandatory`);
    assert.doesNotMatch(prompt, /120[–-]180/u);
  }
});

test("encodes the requested module-specific quality boundaries", () => {
  assert.match(buildSystemPrompt("en", "tutor"), /Explain the concept intuitively first/);
  assert.match(buildSystemPrompt("en", "material"), /Never claim local availability without evidence/);
  assert.match(buildSystemPrompt("en", "patent"), /do not present generated text as legal certainty/);
  assert.match(buildSystemPrompt("en", "engi_legal"), /recommend verification against an official source/);
  assert.match(buildSystemPrompt("en", "engi_match"), /Do not add standards unless they are directly relevant/);
});

test("sends the resolved language and centralized system policy to Groq without a real API call", async () => {
  const requests: Array<{
    messages: Array<{ role: string; content: string }>;
    reasoning_effort?: string;
    max_tokens?: number;
  }> = [];
  const fetchStub: typeof fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { content: "stubbed" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const respond = createGroqResponder({ apiKey: "test-placeholder", model: "test-model", fetchImpl: fetchStub });

  const cases: Array<[string, AiModule, SupportedLanguage, string]> = [
    ["Что такое Young's modulus?", "tutor", "ru", "Respond in Russian"],
    ["Осы beam-нің stress мәнін қалай есептеймін?", "material", "kk", "Respond in Kazakh"],
    ["How do I calculate нагрузка on this beam?", "engi_legal", "en", "Respond in English"],
  ];

  for (const [message, module, requestedLanguage, userInstruction] of cases) {
    assert.equal(await respond(message, module, requestedLanguage), "stubbed");
    const body = requests.at(-1);
    assert.ok(body);
    const systemMessage = body.messages.find(({ role }) => role === "system")?.content ?? "";
    const userMessage = body.messages.find(({ role }) => role === "user")?.content ?? "";
    assert.equal(systemMessage, buildSystemPrompt(requestedLanguage, module));
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.max_tokens, 1600);
    assert.ok(userMessage.includes(userInstruction));
    assert.match(userMessage, /Preserve technical notation and identifiers/);
  }
});

test("uses model-compatible reasoning effort across the Groq fallback chain", async () => {
  const requests: Array<{ model: string; reasoning_effort?: string }> = [];
  const respond = createGroqResponder({
    apiKey: "test-placeholder",
    model: "qwen/qwen3.8-27b",
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string; reasoning_effort?: string };
      requests.push(body);
      if (requests.length < 3) return new Response("{}", { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "fallback success" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(await respond("Что такое напряжение?", "tutor", "ru"), "fallback success");
  assert.deepEqual(requests.map(({ model, reasoning_effort }) => ({ model, reasoning_effort })), [
    { model: "qwen/qwen3.8-27b", reasoning_effort: "none" },
    { model: "openai/gpt-oss-120b", reasoning_effort: "medium" },
    { model: "openai/gpt-oss-20b", reasoning_effort: "medium" },
  ]);
});

test("keeps the route-resolved language when English catalog metadata is attached", async () => {
  const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const fetchStub: typeof fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { content: "stubbed" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const respond = createGroqResponder({ apiKey: "test-placeholder", model: "test-model", fetchImpl: fetchStub });
  const englishMetadata = `[VERIFIED KAZSTANDARD METADATA]
Lookup status: no_result.
No matching current standard was verified in the public KazStandard catalog.
[/VERIFIED KAZSTANDARD METADATA]`;

  const cases: Array<[string, SupportedLanguage, string]> = [
    [`Какие стандарты применимы?\n\n${englishMetadata}`, "ru", "ОТВЕЧАЙ НА РУССКОМ ЯЗЫКЕ."],
    [`Қандай стандарттар қолданылады?\n\n${englishMetadata}`, "kk", "ҚАЗАҚ ТІЛІНДЕ ЖАУАП БЕР."],
    [`Which standards apply?\n\n${englishMetadata}`, "en", "ANSWER IN ENGLISH."],
  ];

  for (const [prompt, language, finalRule] of cases) {
    assert.equal(await respond(prompt, "tutor", language, "Catalog data must not alter response language."), "stubbed");
    const body = requests.at(-1);
    assert.ok(body);
    const systemMessage = body.messages.find(({ role }) => role === "system")?.content ?? "";
    assert.ok(systemMessage.endsWith(finalRule));
    assert.match(systemMessage, /Catalog data must not alter response language/u);
  }
});

test("removes provider think blocks while preserving the Russian final answer", async () => {
  const russianAnswer = "**Момент инерции** характеризует сопротивление тела изменению вращения.";
  const fetchStub: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: `<think>Here's a thinking process that must remain private.</think>\n\n${russianAnswer}`,
        reasoning: "This field must never be exposed.",
      },
    }],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  const respond = createGroqResponder({ apiKey: "test-placeholder", model: "test-model", fetchImpl: fetchStub });

  const response = await respond("Что такое момент инерции?", "tutor", "ru");

  assert.equal(response, russianAnswer);
  assert.doesNotMatch(response, /<\/?think\b|thinking process|reasoning field/iu);
});


test("retries with the secondary credential when Groq rejects the primary credential", async () => {
  const authorizationHeaders: string[] = [];
  const fetchStub: typeof fetch = async (_input, init) => {
    authorizationHeaders.push(new Headers(init?.headers).get("Authorization") ?? "");
    if (authorizationHeaders.length === 1) {
      return new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "stubbed secondary response" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const respond = createGroqResponder({
    apiKey: "primary-placeholder",
    secondaryApiKey: "secondary-placeholder",
    model: "test-model",
    fetchImpl: fetchStub,
  });

  assert.equal(await respond("Что такое момент инерции?", "tutor", "ru"), "stubbed secondary response");
  assert.deepEqual(authorizationHeaders, [
    "Bearer primary-placeholder",
    "Bearer secondary-placeholder",
  ]);
});

test("surfaces a typed rate-limit failure instead of returning provider fallback as assistant content", async () => {
  let requests = 0;
  const respond = createGroqResponder({
    apiKey: "test-placeholder",
    model: "test-model",
    fetchImpl: async () => {
      requests += 1;
      return new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await assert.rejects(
    respond("Какие стандарты относятся к безопасности машин?", "tutor", "ru"),
    (error: unknown) => (
      error instanceof AiProviderError
      && error.category === "rate_limit"
      && error.providerStatus === 429
    ),
  );
  assert.equal(requests, 1);
});

test("retries a rate-limited primary credential once with the distinct secondary credential", async () => {
  const authorizationHeaders: string[] = [];
  const delays: number[] = [];
  const respond = createGroqResponder({
    apiKey: "primary-placeholder",
    secondaryApiKey: "secondary-placeholder",
    model: "test-model",
    fetchImpl: async (_input, init) => {
      authorizationHeaders.push(new Headers(init?.headers).get("Authorization") ?? "");
      if (authorizationHeaders.length === 1) {
        return new Response("{}", { status: 429, headers: { "Retry-After": "2" } });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: "secondary success" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    retryDelay: async (delayMs) => { delays.push(delayMs); },
  });

  assert.equal(await respond("Какие стандарты относятся к безопасности машин?", "tutor", "ru"), "secondary success");
  assert.deepEqual(authorizationHeaders, ["Bearer primary-placeholder", "Bearer secondary-placeholder"]);
  assert.deepEqual(delays, [2_000]);
});

test("parses Retry-After delta seconds and HTTP dates into bounded safe seconds", () => {
  const now = Date.parse("2026-10-31T12:00:00.000Z");
  assert.equal(parseRetryAfter("4", now), 4);
  assert.equal(parseRetryAfter("Sat, 31 Oct 2026 12:00:07 GMT", now), 7);
  assert.equal(parseRetryAfter("invalid", now), undefined);
  assert.equal(parseRetryAfter("99999", now), 300);
});

test("uses bounded jittered backoff when Retry-After is absent", async () => {
  const delays: number[] = [];
  let calls = 0;
  const respond = createGroqResponder({
    apiKey: "primary-placeholder", secondaryApiKey: "secondary-placeholder", model: "test-model",
    random: () => 0.4,
    retryDelay: async (delayMs) => { delays.push(delayMs); },
    fetchImpl: async () => ++calls === 1
      ? new Response("{}", { status: 429 })
      : Response.json({ choices: [{ message: { content: "secondary success" } }] }),
  });
  assert.equal(await respond("Explain stress", "tutor", "en"), "secondary success");
  assert.deepEqual(delays, [600]);
  assert.equal(calls, 2);
});

test("aborting during the rate-limit wait cancels failover and makes no secondary request", async () => {
  let calls = 0;
  const controller = new AbortController();
  const respond = createGroqResponder({
    apiKey: "primary-placeholder", secondaryApiKey: "secondary-placeholder", model: "test-model",
    fetchImpl: async () => { calls += 1; return new Response("{}", { status: 429, headers: { "Retry-After": "1" } }); },
  });
  const pending = respond("Explain stress", "tutor", "en", undefined, [], controller.signal);
  setTimeout(() => controller.abort(new DOMException("cancelled", "AbortError")), 10);
  await assert.rejects(pending, (error: unknown) => error instanceof AiProviderError && error.category === "aborted");
  assert.equal(calls, 1);
});

test("an expiring request deadline cancels the wait and fails closed as rate_limit", async () => {
  let calls = 0;
  const deadline = new AbortController();
  const respond = createGroqResponder({
    apiKey: "primary-placeholder", secondaryApiKey: "secondary-placeholder", model: "test-model",
    fetchImpl: async () => { calls += 1; return new Response("{}", { status: 429, headers: { "Retry-After": "1" } }); },
  });
  const pending = respond("Explain stress", "tutor", "en", undefined, [], deadline.signal);
  setTimeout(() => deadline.abort(new DOMException("deadline exceeded", "TimeoutError")), 10);
  await assert.rejects(pending, (error: unknown) => (
    error instanceof AiProviderError && error.category === "rate_limit" && error.retryAfterSeconds === 1
  ));
  assert.equal(calls, 1);
});

test("an excessive Retry-After skips the secondary credential", async () => {
  let calls = 0;
  const respond = createGroqResponder({
    apiKey: "primary-placeholder", secondaryApiKey: "secondary-placeholder", model: "test-model",
    fetchImpl: async () => { calls += 1; return new Response("{}", { status: 429, headers: { "Retry-After": "10" } }); },
  });
  await assert.rejects(respond("Explain stress", "tutor", "en"), (error: unknown) => (
    error instanceof AiProviderError && error.category === "rate_limit" && error.retryAfterSeconds === 10
  ));
  assert.equal(calls, 1);
});

test("provider telemetry distinguishes credential and model attempts", async () => {
  const entries: Array<Record<string, unknown>> = [];
  const originalLog = console.log;
  console.log = (line?: unknown) => {
    if (typeof line === "string") {
      try { entries.push(JSON.parse(line)); } catch { /* Ignore non-structured test output. */ }
    }
  };
  try {
    let calls = 0;
    const respond = createGroqResponder({
      apiKey: "primary-placeholder", secondaryApiKey: "secondary-placeholder", model: "test-model",
      fetchImpl: async () => ++calls === 1
        ? new Response("{}", { status: 401 })
        : Response.json({ choices: [{ message: { content: "secondary success" } }] }),
    });
    await respond("Explain stress", "tutor", "en");
  } finally {
    console.log = originalLog;
  }
  const requests = entries.filter(({ event }) => event === "ai_provider_request");
  assert.deepEqual(requests.map(({ credential_attempt, model_attempt }) => ({ credential_attempt, model_attempt })), [
    { credential_attempt: 1, model_attempt: 1 },
    { credential_attempt: 2, model_attempt: 1 },
  ]);
});

test("review rate limiting returns safe HTTP 429 without exposing or persisting the draft", async () => {
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  const userMessage: PersistedChatMessage = {
    id: "user-message", text: "Explain Ohm's law", sender: "user", module: "tutor",
    timestamp: "2026-10-31T00:00:00.000Z",
  };
  let providerCalls = 0;
  let completionCalls = 0;
  const draft = JSON.stringify({ response: "UNREVIEWED DRAFT", calculations: [], revealsFinalAnswer: false, uncertain: false });
  const respond = createGroqResponder({
    apiKey: "primary-placeholder", secondaryApiKey: "secondary-placeholder", model: "test-model",
    retryDelay: async () => {},
    fetchImpl: async () => {
      providerCalls += 1;
      if (providerCalls === 1) return Response.json({ choices: [{ message: { content: draft } }] });
      return new Response("{}", { status: 429, headers: { "Retry-After": providerCalls === 2 ? "1" : "7" } });
    },
  });
  const repository = {
    async beginExchange() { return { userMessage, assistantMessage: null, progress: {} }; },
    async messages() { return { items: [], nextCursor: null }; },
    async completeExchange() { completionCalls += 1; throw new Error("must not persist an unreviewed draft"); },
  } as unknown as ChatRepository;
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.auth = { userId: "owner", accessToken: "test-only", claims: {} }; next();
  };
  const app = express(); app.use(express.json());
  app.use(createAiRouter(authenticate, (_request, _response, next) => next(), {
    repository, detectLanguage: () => "en", generateResponse: respond, tutorPipeline: createTutorPipeline(respond),
  }));
  await withServer(app, async (url) => {
    const response = await fetch(`${url}/api/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "review-rate-limit" },
      body: JSON.stringify({ session_id: sessionId, text: userMessage.text, lang: "en" }),
    });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "7");
    const body = await response.json() as { error: { code: string }; user_message: PersistedChatMessage; assistant_message: null };
    assert.equal(body.error.code, "ai_provider_rate_limited");
    assert.equal(body.user_message.id, userMessage.id);
    assert.equal(body.assistant_message, null);
    assert.doesNotMatch(JSON.stringify(body), /UNREVIEWED DRAFT/u);
  });
  assert.equal(providerCalls, 3);
  assert.equal(completionCalls, 0);
});

test("a completed idempotent replay performs no provider call", async () => {
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  const userMessage = { id: "user", text: "Explain stress", sender: "user" as const, module: "tutor" as const,
    timestamp: "2026-10-31T00:00:00.000Z" };
  const assistantMessage = { ...userMessage, id: "assistant", sender: "ai" as const, text: "Reviewed response" };
  let providerCalls = 0;
  const repository = {
    async beginExchange() { return { userMessage, assistantMessage, progress: {} }; },
  } as unknown as ChatRepository;
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.auth = { userId: "owner", accessToken: "test-only", claims: {} }; next();
  };
  const app = express(); app.use(express.json());
  app.use(createAiRouter(authenticate, (_request, _response, next) => next(), {
    repository, detectLanguage: () => "en", generateResponse: async () => { providerCalls += 1; return "unused"; },
  }));
  await withServer(app, async (url) => {
    const response = await fetch(`${url}/api/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "completed-replay" },
      body: JSON.stringify({ session_id: sessionId, text: userMessage.text, lang: "en" }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { idempotent_replay: boolean }).idempotent_replay, true);
  });
  assert.equal(providerCalls, 0);
});
test("local fallback responses use the supplied resolved language", async () => {
  const respond = createGroqResponder({ model: "test-model" });
  assert.match(await respond("Как рассчитать torque?", "tutor", "ru"), /Демо-режим/);
  assert.match(await respond("Arduino-ға sensor қалай қосамын?", "tutor", "kk"), /Демо режим/);
  assert.match(await respond("How should I calculate нагрузка?", "tutor", "en"), /Demo Mode/);
});

test("Groq requests abort at the provider timeout with a typed sanitized error", async () => {
  const respond = createGroqResponder({
    apiKey: "test-placeholder",
    model: "test-model",
    timeoutMs: 5,
    fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
  });
  await assert.rejects(
    respond("Что такое момент?", "tutor", "ru"),
    (error: unknown) => error instanceof AiProviderError && error.category === "timeout",
  );
});

test("caller cancellation aborts Groq work and is distinguished from timeout", async () => {
  const controller = new AbortController();
  const respond = createGroqResponder({
    apiKey: "test-placeholder",
    model: "test-model",
    timeoutMs: 1_000,
    fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
  });
  const pending = respond("Что такое момент?", "tutor", "ru", undefined, [], controller.signal);
  controller.abort();
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof AiProviderError && error.category === "aborted",
  );
});
