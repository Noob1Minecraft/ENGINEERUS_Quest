import assert from "node:assert/strict";
import test from "node:test";
import { createGroqResponder } from "../server/ai/groqClient";
import {
  buildSystemPrompt,
  resolveResponseLanguage,
  type AiModule,
  type SupportedLanguage,
} from "../server/ai/languagePolicy";

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
    assert.ok(userMessage.includes(userInstruction));
    assert.match(userMessage, /Preserve technical notation and identifiers/);
  }
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
test("local fallback responses use the supplied resolved language", async () => {
  const respond = createGroqResponder({ model: "test-model" });
  assert.match(await respond("Как рассчитать torque?", "tutor", "ru"), /Демо-режим/);
  assert.match(await respond("Arduino-ға sensor қалай қосамын?", "tutor", "kk"), /Демо режим/);
  assert.match(await respond("How should I calculate нагрузка?", "tutor", "en"), /Demo Mode/);
});
