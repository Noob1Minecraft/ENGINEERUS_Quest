import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseAbuseControlStore } from "../server/security/supabaseAbuseControls";

test("Supabase abuse store maps an authoritative budget without exposing request content", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: { allowed: true, limit: 20, remaining: 19, reset_at: "2026-09-06T12:15:00Z" }, error: null };
    },
  } as unknown as SupabaseClient;
  const store = new SupabaseAbuseControlStore(client);
  const result = await store.consume("123e4567-e89b-42d3-a456-426614174001", "ai_request");
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 19);
  assert.deepEqual(Object.keys(calls[0].args).sort(), ["p_actor_id", "p_operation"]);
});

test("Supabase AI capacity uses opaque leases and releases exactly once", async () => {
  const calls: string[] = [];
  const client = {
    async rpc(name: string) {
      calls.push(name);
      return { data: true, error: null };
    },
  } as unknown as SupabaseClient;
  const store = new SupabaseAbuseControlStore(client);
  const lease = await store.tryAcquire("123e4567-e89b-42d3-a456-426614174001", {
    maxPerUser: 1, maxGlobal: 8, leaseMs: 120_000,
  });
  assert.ok(lease);
  await lease.release();
  await lease.release();
  assert.deepEqual(calls, ["acquire_ai_capacity", "release_ai_capacity"]);
});

test("Supabase AI capacity fails closed when application and database limits drift", async () => {
  let called = false;
  const client = {
    async rpc() {
      called = true;
      return { data: true, error: null };
    },
  } as unknown as SupabaseClient;
  const store = new SupabaseAbuseControlStore(client);
  await assert.rejects(
    store.tryAcquire("123e4567-e89b-42d3-a456-426614174001", {
      maxPerUser: 2, maxGlobal: 8, leaseMs: 120_000,
    }),
    /does not match the database contract/u,
  );
  assert.equal(called, false);
});
