import { randomUUID } from "node:crypto";

export function createIdempotencyKey(value: string | undefined, scope: string): string {
  if (!value) return `${scope}:${randomUUID()}`;
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw new Error("Invalid idempotency key.");
  }
  return `${scope}:${value}`;
}
