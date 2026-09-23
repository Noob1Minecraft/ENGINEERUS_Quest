import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("browser and responsive shell use Engineerus Quest branding", () => {
  assert.match(source("index.html"), /<title>Engineerus Quest<\/title>/u);
  assert.match(source("src/components/AppSidebar.tsx"), /Engineerus Quest/u);
  assert.match(source("src/components/BottomNav.tsx"), /BrandLogo/u);
  assert.doesNotMatch(
    [source("index.html"), source("src/components/AppSidebar.tsx"), source("src/components/BottomNav.tsx")].join("\n"),
    /Edu-assistant-v2|edu-assistant-v2|Edu Assistant/iu,
  );
});
