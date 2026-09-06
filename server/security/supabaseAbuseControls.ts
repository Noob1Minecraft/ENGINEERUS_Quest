import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AbuseBudgetResult,
  AbuseControlStore,
  AiCapacityLease,
  AiCapacityStore,
} from "./securityControlStore";

type BudgetRow = {
  allowed?: boolean;
  limit?: number;
  remaining?: number;
  reset_at?: string;
};

export class SupabaseAbuseControlStore implements AbuseControlStore, AiCapacityStore {
  constructor(private readonly client: SupabaseClient) {}

  async consume(userId: string, operation: "ai_request" | "ai_vision"): Promise<AbuseBudgetResult> {
    const { data, error } = await this.client.rpc("consume_abuse_budget", {
      p_actor_id: userId,
      p_operation: operation,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Authoritative abuse budget is unavailable.");
    }
    const row = data as BudgetRow;
    const resetAt = new Date(row.reset_at ?? "");
    if (typeof row.allowed !== "boolean" || typeof row.limit !== "number"
      || typeof row.remaining !== "number" || Number.isNaN(resetAt.getTime())) {
      throw new Error("Authoritative abuse budget returned an invalid result.");
    }
    return { allowed: row.allowed, limit: row.limit, remaining: row.remaining, resetAt };
  }

  async tryAcquire(
    userId: string,
    limits: { maxPerUser: number; maxGlobal: number; leaseMs: number },
  ): Promise<AiCapacityLease | null> {
    if (limits.maxPerUser !== 1 || limits.maxGlobal !== 8 || limits.leaseMs !== 120_000) {
      throw new Error("Authoritative AI capacity configuration does not match the database contract.");
    }
    const leaseId = crypto.randomUUID();
    const { data, error } = await this.client.rpc("acquire_ai_capacity", {
      p_actor_id: userId,
      p_lease_id: leaseId,
    });
    if (error) throw new Error("Authoritative AI capacity is unavailable.");
    if (data !== true) return null;

    let released = false;
    return {
      release: async () => {
        if (released) return;
        const result = await this.client.rpc("release_ai_capacity", {
          p_actor_id: userId,
          p_lease_id: leaseId,
        });
        if (result.error) throw new Error("Authoritative AI capacity release failed.");
        released = true;
      },
    };
  }
}
