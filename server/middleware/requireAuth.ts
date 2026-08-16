import type { RequestHandler } from "express";
import {
  AuthConfigurationError,
  InvalidAccessTokenError,
  type VerifySupabaseAccessToken,
} from "../auth/supabaseJwt";

function readBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer ([^\s]+)$/i);
  return match?.[1] ?? null;
}

export function createRequireAuth(verifyAccessToken: VerifySupabaseAccessToken): RequestHandler {
  return async (request, response, next) => {
    const accessToken = readBearerToken(request.header("authorization"));
    if (!accessToken) {
      response.status(401).json({
        error: { code: "missing_bearer_token", message: "Authentication is required." },
      });
      return;
    }

    try {
      const identity = await verifyAccessToken(accessToken);
      response.locals.auth = { ...identity, accessToken };
      next();
    } catch (error) {
      if (error instanceof AuthConfigurationError) {
        response.status(503).json({
          error: { code: "auth_unavailable", message: "Authentication service is unavailable." },
        });
        return;
      }

      if (error instanceof InvalidAccessTokenError) {
        response.status(401).json({
          error: { code: "invalid_access_token", message: "Authentication is required." },
        });
        return;
      }

      response.status(401).json({
        error: { code: "invalid_access_token", message: "Authentication is required." },
      });
    }
  };
}
