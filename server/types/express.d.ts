import type { JWTPayload } from "jose";

declare global {
  namespace Express {
    interface Locals {
      requestId: string;
      auth: {
        userId: string;
        accessToken: string;
        claims: JWTPayload;
      };
    }
  }
}

export {};
