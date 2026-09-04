export const ANALYTICS_EVENT_NAMES = [
  "signup_completed",
  "login_completed",
  "onboarding_started",
  "onboarding_completed",
  "first_meaningful_action",
  "ai_session_started",
  "ai_message_sent",
  "quest_completed",
  "learning_resource_opened",
  "project_created",
  "project_application_submitted",
  "project_applied",
  "project_invitation_accepted",
  "engimatch_viewed",
  "engimatch_action_taken",
  "document_uploaded",
  "image_uploaded",
  "direct_chat_started",
  "direct_chat_opened",
  "direct_message_sent",
  "invite_link_created",
  "invite_link_opened",
  "invited_user_registered",
  "feedback_submitted",
  "daily_quest_completed",
  "weekly_quest_completed",
  "achievement_unlocked",
  "level_up",
  "quest_chain_completed",
] as const;

export type AnalyticsEventName = typeof ANALYTICS_EVENT_NAMES[number];
export type SafeAnalyticsMetadata = Record<string, string | number | boolean | null>;

export type AnalyticsEventContext = {
  sessionId?: string | null;
};

export type AnalyticsEventRecorder = (
  userId: string,
  eventName: AnalyticsEventName,
  metadata: SafeAnalyticsMetadata,
  dedupeKey: string,
  context?: AnalyticsEventContext,
) => Promise<void>;

const ALLOWED_METADATA_KEYS: Record<AnalyticsEventName, readonly string[]> = {
  signup_completed: [],
  login_completed: [],
  onboarding_started: [],
  onboarding_completed: [],
  first_meaningful_action: ["trigger_event"],
  ai_session_started: ["module"],
  ai_message_sent: ["module", "language", "has_document", "image_count"],
  quest_completed: ["quest_id"],
  learning_resource_opened: ["resource_id", "resource_type"],
  project_created: [],
  project_application_submitted: [],
  project_applied: [],
  project_invitation_accepted: [],
  engimatch_viewed: ["mode"],
  engimatch_action_taken: ["action"],
  document_uploaded: ["file_type", "size_bucket"],
  image_uploaded: ["format", "size_bucket"],
  direct_chat_started: [],
  direct_chat_opened: [],
  direct_message_sent: [],
  invite_link_created: [],
  invite_link_opened: [],
  invited_user_registered: [],
  feedback_submitted: ["category", "product_area", "rating"],
  daily_quest_completed: ["quest_id"],
  weekly_quest_completed: ["quest_id"],
  achievement_unlocked: ["achievement"],
  level_up: ["level"],
  quest_chain_completed: ["chain"],
};

const FORBIDDEN_KEY = /(message|prompt|response|content|email|token|password|authorization|cookie|storage|url|filename|name|notes?|private|phone|ip|user.?agent)/i;

export class InvalidAnalyticsEventError extends Error {
  constructor(message = "Analytics metadata is not allowed.") {
    super(message);
    this.name = "InvalidAnalyticsEventError";
  }
}

export function validateAnalyticsMetadata(
  eventName: AnalyticsEventName,
  metadata: SafeAnalyticsMetadata,
): SafeAnalyticsMetadata {
  const allowed = new Set(ALLOWED_METADATA_KEYS[eventName]);
  const clean: SafeAnalyticsMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowed.has(key) || FORBIDDEN_KEY.test(key)) throw new InvalidAnalyticsEventError();
    if (typeof value === "string" && value.length > 120) throw new InvalidAnalyticsEventError();
    if (typeof value === "number" && !Number.isFinite(value)) throw new InvalidAnalyticsEventError();
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
      throw new InvalidAnalyticsEventError();
    }
    clean[key] = value;
  }
  if (Buffer.byteLength(JSON.stringify(clean), "utf8") > 1_500) throw new InvalidAnalyticsEventError();
  return clean;
}
