import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/components/DocumentsTab.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const ai = readFileSync(new URL("../src/components/AIAssistantTab.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../server/routes/documents.ts", import.meta.url), "utf8");

test("Documents UI has authenticated upload, loading, empty, failure, delete, and Tutor actions", () => {
  assert.match(component, /type="file"/u);
  assert.match(component, /loading|Загрузка документов/iu);
  assert.match(component, /No documents yet|Документов пока нет/u);
  assert.match(component, /document\.status !== "ready"/u);
  assert.match(component, /deleteDocument/u);
  assert.match(component, /onUseWithTutor/u);
  assert.match(component, /OCR is not supported/u);
});

test("document selection adds only document_id to the existing AI request and can be cleared", () => {
  assert.match(app, /setAiDocument\(\{ id: document\.id, name: document\.original_filename \}\)/u);
  assert.match(ai, /document_id: documentContext\.id/u);
  assert.match(ai, /onClearDocumentContext/u);
  assert.doesNotMatch(ai, /document_(?:text|chunks|content)\s*:/u);
});

test("document logs contain bounded metadata but no filename or content fields", () => {
  const logCalls = route.match(/securityLogger\.(?:info|warn)\([\s\S]*?\n\s*\}\);/gu) ?? [];
  assert.ok(logCalls.length >= 2);
  for (const call of logCalls) assert.doesNotMatch(call, /original_filename|displayName|file\.originalname|extracted|chunk\.text|prompt/iu);
});
