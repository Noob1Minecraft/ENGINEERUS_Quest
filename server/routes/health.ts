import { Router } from "express";

const SERVICE_NAME = "engineerus-api";

function healthPayload() {
  return {
    status: "ok",
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

export function createHealthRouter(): Router {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.status(200).json(healthPayload());
  });

  router.get("/api/health", (_request, response) => {
    response.status(200).json(healthPayload());
  });

  return router;
}
