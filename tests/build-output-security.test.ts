import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import express from "express";
import test from "node:test";
import { createHealthRouter } from "../server/routes/health";
import {
  FRONTEND_BUILD_DIRECTORY,
  getFrontendStaticRoot,
  mountApiNotFound,
  mountProductionFrontend,
} from "../server/staticFrontend";
import { withServer } from "./helpers";

function listFiles(root: string, current = root): string[] {
  return readdirSync(current).flatMap((name) => {
    const absolute = path.join(current, name);
    return statSync(absolute).isDirectory()
      ? listFiles(root, absolute)
      : [path.relative(root, absolute).replaceAll(path.sep, "/")];
  });
}

test("production build keeps browser and server artifacts physically separate", () => {
  const projectRoot = process.cwd();
  const frontendRoot = getFrontendStaticRoot(projectRoot);
  const serverRoot = path.join(projectRoot, "server-dist");
  const frontendFiles = listFiles(frontendRoot);
  const serverFiles = listFiles(serverRoot);

  assert.equal(FRONTEND_BUILD_DIRECTORY, "dist");
  assert.notEqual(frontendRoot, serverRoot);
  assert.ok(frontendFiles.includes("index.html"));
  assert.ok(frontendFiles.some((file) => /^assets\/.*\.js$/.test(file)));
  assert.ok(frontendFiles.some((file) => /^assets\/.*\.css$/.test(file)));
  assert.equal(frontendFiles.some((file) => /(^|\/)server\.cjs$/.test(file)), false);
  assert.equal(frontendFiles.some((file) => /(^|\/)server\.cjs\.map$/.test(file)), false);
  assert.deepEqual(serverFiles, ["server.cjs"]);
  assert.equal(existsSync(path.join(serverRoot, "server.cjs.map")), false);
});

test("production static mounting serves only the browser root while health and API routes remain available", async () => {
  const app = express();
  app.use(createHealthRouter());
  app.get("/api/focused-build-check", (_request, response) => response.json({ ok: true }));
  mountApiNotFound(app);
  const staticRoot = mountProductionFrontend(app);

  assert.equal(staticRoot, path.join(process.cwd(), "dist"));
  assert.equal(existsSync(path.join(staticRoot, "server.cjs")), false);

  await withServer(app, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { status: string }).status, "ok");

    const api = await fetch(`${baseUrl}/api/focused-build-check`);
    assert.equal(api.status, 200);
    assert.deepEqual(await api.json(), { ok: true });

    for (const method of ["GET", "POST"]) {
      const missingApi = await fetch(`${baseUrl}/api/not-a-real-route`, { method });
      assert.equal(missingApi.status, 404);
      assert.equal(missingApi.headers.get("content-type")?.startsWith("application/json"), true);
      assert.deepEqual(await missingApi.json(), {
        error: { code: "api_route_not_found", message: "The requested API route was not found." },
      });
    }

    const index = await fetch(baseUrl);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /<div id="root"><\/div>/);

    const spaRoute = await fetch(`${baseUrl}/projects/example`);
    assert.equal(spaRoute.status, 200);
    assert.equal(spaRoute.headers.get("content-type")?.startsWith("text/html"), true);
    assert.match(await spaRoute.text(), /<div id="root"><\/div>/);

    const backendArtifactUrl = await fetch(`${baseUrl}/server.cjs`);
    assert.equal(backendArtifactUrl.headers.get("content-type")?.startsWith("text/html"), true);
    assert.equal((await backendArtifactUrl.text()).includes("Engineerus Quest server running"), false);
  });
});

test("built frontend index references only browser assets", () => {
  const index = readFileSync(path.join(getFrontendStaticRoot(), "index.html"), "utf8");
  assert.match(index, /\/assets\/.*\.js/);
  assert.doesNotMatch(index, /server-dist|server\.cjs/);
});

test("package scripts build and start the backend outside the public directory without source maps", () => {
  const manifest = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  assert.match(manifest.scripts.build, /--outfile=server-dist\/server\.cjs/);
  assert.doesNotMatch(manifest.scripts.build, /--sourcemap/);
  assert.doesNotMatch(manifest.scripts.build, /--outfile=dist\/server\.cjs/);
  assert.equal(manifest.scripts.start, "node server-dist/server.cjs");
});

test("server mounts the API not-found boundary before development or production frontend fallbacks", () => {
  const serverSource = readFileSync(path.resolve("server.ts"), "utf8");
  const apiBoundary = serverSource.indexOf("mountApiNotFound(app)");
  const environmentBranch = serverSource.indexOf('if (env.NODE_ENV !== "production")');
  assert.ok(apiBoundary > 0);
  assert.ok(environmentBranch > apiBoundary);
});
