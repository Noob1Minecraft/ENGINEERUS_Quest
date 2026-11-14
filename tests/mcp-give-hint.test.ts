import assert from "node:assert/strict";
import test from "node:test";

import { createTutorPipeline } from "../server/ai/tutor/pipeline";
import { createGiveHintHandler } from "../mcp/tools/giveHint";

test("give_hint returns a guided hint from the existing Tutor pipeline", async () => {
  const calls: unknown[] = [];
  const handler = createGiveHintHandler(async (input) => {
    calls.push(input);
    return "Start by identifying the applicable physical law. Which quantities are known?";
  });

  const result = await handler({ problem: "Explain how to begin an Ohm-law problem.", language: "en" });

  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]?.type, "text");
  assert.match(result.content[0]?.text ?? "", /which quantities are known/i);
  assert.equal(calls.length, 1);
  assert.equal((calls[0] as { plan: { mode: string } }).plan.mode, "hint");
});

test("give_hint rejects an unsupported language before invoking Tutor", async () => {
  let calls = 0;
  const handler = createGiveHintHandler(async () => {
    calls += 1;
    return "unused";
  });

  const result = await handler({ problem: "Ohm's law", language: "de" });

  assert.equal(result.isError, true);
  assert.equal(calls, 0);
  assert.match(result.content[0]?.text ?? "", /invalid give_hint input/i);
});

test("give_hint rejects an empty problem before invoking Tutor", async () => {
  let calls = 0;
  const handler = createGiveHintHandler(async () => {
    calls += 1;
    return "unused";
  });

  const result = await handler({ problem: "   ", language: "ru" });

  assert.equal(result.isError, true);
  assert.equal(calls, 0);
  assert.match(result.content[0]?.text ?? "", /invalid give_hint input/i);
});

test("give_hint sanitizes Tutor failures", async () => {
  const handler = createGiveHintHandler(async () => {
    throw new Error("provider-key-and-internal-stack-must-not-leak");
  });

  const result = await handler({ problem: "What is beam deflection?", language: "en" });

  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /unable to generate a hint/i);
  assert.doesNotMatch(result.content[0]?.text ?? "", /provider-key|stack/i);
});

test("give_hint keeps the Tutor final-answer leakage guard", async () => {
  let providerCalls = 0;
  const unsafeDraft = JSON.stringify({
    response: "Answer: I = 3 A.",
    calculations: [],
    revealsFinalAnswer: false,
    uncertain: false,
  });
  const generate = async () => {
    providerCalls += 1;
    return unsafeDraft;
  };
  const handler = createGiveHintHandler(createTutorPipeline(generate as never));

  const result = await handler({ problem: "U = 12 V, R = 4 Ohm. Find I.", language: "en" });

  assert.equal(result.isError, undefined);
  assert.equal(providerCalls, 2);
  assert.doesNotMatch(result.content[0]?.text ?? "", /3\s*A/i);
  assert.match(result.content[0]?.text ?? "", /could not reliably check/i);
});
