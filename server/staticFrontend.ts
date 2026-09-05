import type { Express } from "express";
import express from "express";
import path from "node:path";

export const FRONTEND_BUILD_DIRECTORY = "dist";

export function getFrontendStaticRoot(projectRoot = process.cwd()): string {
  return path.join(projectRoot, FRONTEND_BUILD_DIRECTORY);
}

export function mountApiNotFound(app: Express): void {
  app.use("/api", (_request, response) => response.status(404).json({
    error: {
      code: "api_route_not_found",
      message: "The requested API route was not found.",
    },
  }));
}

export function mountProductionFrontend(app: Express, projectRoot = process.cwd()): string {
  const staticRoot = getFrontendStaticRoot(projectRoot);
  app.use(express.static(staticRoot));
  app.get("*", (_request, response) => response.sendFile(path.join(staticRoot, "index.html")));
  return staticRoot;
}
