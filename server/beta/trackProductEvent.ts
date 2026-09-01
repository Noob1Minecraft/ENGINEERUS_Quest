import type { ProductEventName, ProductEventRecorder, SafeEventMetadata } from "../persistence/beta";
import { securityLogger } from "../security/structuredLogger";

export async function trackProductEvent(
  recorder: ProductEventRecorder | undefined,
  userId: string,
  eventName: ProductEventName,
  metadata: SafeEventMetadata,
  dedupeKey: string,
): Promise<void> {
  if (!recorder) return;
  try {
    await recorder(userId, eventName, metadata, dedupeKey);
  } catch {
    // Product analytics must never fail a completed user action. The event name
    // is safe operational metadata; identity and user content are not logged.
    securityLogger.warn("product_event_record_failed", { eventName });
  }
}
