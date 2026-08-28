import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../src/components/ImagesPanel.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const ai = readFileSync(new URL("../src/components/AIAssistantTab.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../server/routes/images.ts", import.meta.url), "utf8");

test("minimal Images UI supports private upload, selection, deletion, error, and pagination states", () => {
  assert.match(panel, /accept="image\/jpeg,image\/png,image\/webp"/u);
  assert.match(panel, /current\.length < 3/u);
  assert.match(panel, /deleteImage/u);
  assert.match(panel, /next_cursor|loadMore/u);
  assert.match(panel, /Visual analysis does not certify/u);
  assert.doesNotMatch(panel, /publicUrl|signedUrl|storage_path/u);
});

test("image selection sends only server IDs to the existing AI request and remains clearable", () => {
  assert.match(app, /setAiImages\(images\.map/u);
  assert.match(ai, /image_ids: imageContext\.map/u);
  assert.match(ai, /onClearImageContext/u);
  assert.doesNotMatch(ai, /image_(?:url|base64|binary)\s*:/iu);
});

test("image logs contain only safe bounded metadata", () => {
  const logCalls = route.match(/securityLogger\.(?:info|warn)\([\s\S]*?\n\s*\}\);/gu) ?? [];
  assert.ok(logCalls.length >= 2);
  for (const call of logCalls) assert.doesNotMatch(call, /original_filename|displayName|file\.originalname|buffer|base64|storage_path|signed[_-]?url|prompt|response|exif/iu);
});
