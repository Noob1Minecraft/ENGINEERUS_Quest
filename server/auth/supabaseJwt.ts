import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import type { ServerEnv } from "../config/env";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidAccessTokenError extends Error {
  constructor() {
    super("The access token is invalid or expired.");
    this.name = "InvalidAccessTokenError";
  }
}

export class AuthConfigurationError extends Error {
  constructor() {
    super("Authentication service is unavailable.");
    this.name = "AuthConfigurationError";
  }
}

export type VerifiedSupabaseIdentity = {
  userId: string;
  claims: JWTPayload;
};

export type VerifySupabaseAccessToken = (
  accessToken: string,
) => Promise<VerifiedSupabaseIdentity>;

export function createSupabaseAccessTokenVerifier(
  env: ServerEnv,
  suppliedKey?: JWTVerifyGetKey,
): VerifySupabaseAccessToken {
  if (!env.SUPABASE_URL || !env.supabaseConfigured) {
    return async () => {
      throw new AuthConfigurationError();
    };
  }

  const issuer = `${env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1`;
  const key = suppliedKey ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return async (accessToken) => {
    try {
      const { payload } = await jwtVerify(accessToken, key, {
        issuer,
        audience: env.SUPABASE_JWT_AUDIENCE,
        algorithms: ["ES256", "RS256"],
      });

      if (!payload.sub || !UUID_PATTERN.test(payload.sub) || payload.role !== "authenticated") {
        throw new InvalidAccessTokenError();
      }

      return { userId: payload.sub, claims: payload };
    } catch (error) {
      if (error instanceof AuthConfigurationError) throw error;
      if (error instanceof InvalidAccessTokenError) throw error;
      if (error instanceof joseErrors.JOSEError || error instanceof Error) {
        throw new InvalidAccessTokenError();
      }
      throw new InvalidAccessTokenError();
    }
  };
}
