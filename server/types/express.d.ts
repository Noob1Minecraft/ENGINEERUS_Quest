import type { JWTPayload } from "jose";

declare global {
  namespace Express {
    interface Locals {
      auth: {
        userId: string;
        accessToken: string;
        claims: JWTPayload;
      };
    }
  }
}

export {};
