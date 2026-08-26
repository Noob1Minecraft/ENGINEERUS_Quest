import type { Store } from "express-rate-limit";

/**
 * Injection boundary for a future shared rate-limit store (for example, a
 * managed Redis-compatible service). Phase F3 deliberately keeps the default
 * in memory and does not provision or connect to any cloud resource.
 */
export interface RateLimitStoreFactory {
  create(namespace: string): Store;
}

export type AiCapacityLease = {
  release(): void | Promise<void>;
};

export interface AiCapacityStore {
  tryAcquire(
    userId: string,
    limits: { maxPerUser: number; maxGlobal: number; leaseMs: number },
  ): Promise<AiCapacityLease | null>;
}

type ActiveLease = { id: symbol; userId: string; expiresAt: number };

/** Per-process fallback. A distributed adapter can replace it without route changes. */
export class InMemoryAiCapacityStore implements AiCapacityStore {
  private readonly leases = new Map<symbol, ActiveLease>();

  async tryAcquire(
    userId: string,
    limits: { maxPerUser: number; maxGlobal: number; leaseMs: number },
  ): Promise<AiCapacityLease | null> {
    const now = Date.now();
    for (const [id, lease] of this.leases) {
      if (lease.expiresAt <= now) this.leases.delete(id);
    }

    let activeForUser = 0;
    for (const lease of this.leases.values()) {
      if (lease.userId === userId) activeForUser += 1;
    }
    if (activeForUser >= limits.maxPerUser || this.leases.size >= limits.maxGlobal) return null;

    const id = Symbol(userId);
    this.leases.set(id, { id, userId, expiresAt: now + limits.leaseMs });
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.leases.delete(id);
      },
    };
  }
}
