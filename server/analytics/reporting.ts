import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";
import { PersistenceError } from "../persistence/errors";

export type BetaAnalyticsRange = "today" | "7d" | "30d" | "all";

export type AnalyticsReportEvent = {
  user_id: string;
  event_name: string;
  created_at: string;
};

export type AnalyticsReportParticipant = {
  user_id: string;
  onboarding_completed_at: string | null;
};

type RetentionStatus = "mature" | "immature_cohort" | "no_eligible_cohort";

export type BetaAnalyticsReport = {
  generated_at: string;
  range: { key: BetaAnalyticsRange; from: string | null; to: string };
  overview: {
    total_signups: number;
    signups_in_range: number;
    activated_users: number;
    activation_rate_percent: number | null;
    active_users_in_range: number;
    dau: number;
    wau: number;
    mau: number;
  };
  retention: Array<{
    day: 1 | 7 | 30;
    status: RetentionStatus;
    eligible_users: number;
    immature_users: number;
    retained_users: number;
    rate_percent: number | null;
  }>;
  features: Array<{
    key: "ai_tutor" | "quests" | "projects" | "project_applications" | "engimatch" | "documents" | "direct_chat";
    unique_users: number;
    percent_of_signups: number | null;
    percent_of_activated: number | null;
    event_count: number;
  }>;
  funnel: {
    onboarding_available: true;
    signups: number;
    onboarding_completed: number;
    activated: number;
    retained_d1: number;
    retained_d7: number;
    retained_d30: number;
  };
  health: {
    sample_size: number;
    small_sample: boolean;
    warning: string | null;
    most_used_feature: string | null;
    least_used_feature: string | null;
    feature_concentration_percent: number | null;
    activation_trend: "up" | "down" | "flat" | "insufficient_data";
  };
};

const DAY_MS = 86_400_000;
const REPORT_PAGE_SIZE = 1_000;
const MAX_REPORT_ROWS = 25_000;

const MEANINGFUL_EVENTS = new Set([
  "ai_message_sent",
  "quest_completed",
  "project_created",
  "project_application_submitted",
  "project_applied",
  "project_invitation_accepted",
  "engimatch_action_taken",
  "document_uploaded",
  "image_uploaded",
  "direct_chat_started",
]);

const FEATURES = [
  { key: "ai_tutor" as const, events: new Set(["ai_message_sent"]) },
  { key: "quests" as const, events: new Set(["quest_completed"]) },
  { key: "projects" as const, events: new Set(["project_created"]) },
  { key: "project_applications" as const, events: new Set(["project_application_submitted", "project_applied"]) },
  { key: "engimatch" as const, events: new Set(["engimatch_action_taken"]) },
  { key: "documents" as const, events: new Set(["document_uploaded", "image_uploaded"]) },
  { key: "direct_chat" as const, events: new Set(["direct_chat_started"]) },
];

function utcDay(timestamp: string | Date): number {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid analytics timestamp.");
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS);
}

function percent(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator * 10_000) / denominator) / 100;
}

export function resolveBetaAnalyticsWindow(range: BetaAnalyticsRange, now: Date) {
  const today = utcDay(now);
  const days = range === "today" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : null;
  return {
    fromDay: days === null ? null : today - days + 1,
    toDay: today,
    from: days === null ? null : new Date((today - days + 1) * DAY_MS).toISOString(),
    to: now.toISOString(),
  };
}

export function buildBetaAnalyticsReport(
  events: readonly AnalyticsReportEvent[],
  participants: readonly AnalyticsReportParticipant[],
  range: BetaAnalyticsRange,
  now = new Date(),
): BetaAnalyticsReport {
  const window = resolveBetaAnalyticsWindow(range, now);
  const throughNow = events.filter((event) => new Date(event.created_at).getTime() <= now.getTime());
  const inRange = (event: AnalyticsReportEvent) => {
    const day = utcDay(event.created_at);
    return (window.fromDay === null || day >= window.fromDay) && day <= window.toDay;
  };
  const rangedEvents = throughNow.filter(inRange);
  const signupEvents = throughNow.filter((event) => event.event_name === "signup_completed");
  const signupDay = new Map<string, number>();
  for (const event of signupEvents) {
    const day = utcDay(event.created_at);
    signupDay.set(event.user_id, Math.min(signupDay.get(event.user_id) ?? day, day));
  }
  const activationUsers = new Set(throughNow.filter((event) => event.event_name === "first_meaningful_action").map((event) => event.user_id));
  const meaningful = throughNow.filter((event) => MEANINGFUL_EVENTS.has(event.event_name));
  const meaningfulDays = new Map<string, Set<number>>();
  for (const event of meaningful) {
    const days = meaningfulDays.get(event.user_id) ?? new Set<number>();
    days.add(utcDay(event.created_at));
    meaningfulDays.set(event.user_id, days);
  }
  const rangeSignupUsers = new Set(
    [...signupDay].filter(([, day]) => (window.fromDay === null || day >= window.fromDay) && day <= window.toDay).map(([userId]) => userId),
  );
  const retainedByDay = ([1, 7, 30] as const).map((day) => {
    const eligible = [...rangeSignupUsers].filter((userId) => signupDay.get(userId)! + day <= window.toDay);
    const retained = eligible.filter((userId) => meaningfulDays.get(userId)?.has(signupDay.get(userId)! + day)).length;
    const status: RetentionStatus = rangeSignupUsers.size === 0
      ? "no_eligible_cohort"
      : eligible.length === 0 ? "immature_cohort" : "mature";
    return {
      day,
      status,
      eligible_users: eligible.length,
      immature_users: rangeSignupUsers.size - eligible.length,
      retained_users: retained,
      rate_percent: status === "mature" ? percent(retained, eligible.length) : null,
    };
  });
  const totalSignups = signupDay.size;
  const activatedUsers = [...signupDay.keys()].filter((userId) => activationUsers.has(userId)).length;
  const activeInWindow = new Set(rangedEvents.filter((event) => MEANINGFUL_EVENTS.has(event.event_name)).map((event) => event.user_id));
  const activeSince = (days: number) => new Set(meaningful.filter((event) => utcDay(event.created_at) >= window.toDay - days + 1).map((event) => event.user_id)).size;
  const features = FEATURES.map((feature) => {
    const matching = rangedEvents.filter((event) => feature.events.has(event.event_name));
    const users = new Set(matching.map((event) => event.user_id));
    return {
      key: feature.key,
      unique_users: users.size,
      percent_of_signups: percent(users.size, totalSignups),
      percent_of_activated: percent(users.size, activatedUsers),
      event_count: matching.length,
    };
  });
  const completedOnboarding = new Set(
    participants.filter((participant) => participant.onboarding_completed_at !== null).map((participant) => participant.user_id),
  );
  const featureUses = features.reduce((sum, feature) => sum + feature.unique_users, 0);
  const sortedFeatures = [...features].sort((a, b) => b.unique_users - a.unique_users || a.key.localeCompare(b.key));

  const activationRateForDays = (startDay: number, endDay: number) => {
    const users = [...signupDay].filter(([, day]) => day >= startDay && day <= endDay).map(([userId]) => userId);
    return users.length === 0 ? null : percent(users.filter((userId) => activationUsers.has(userId)).length, users.length);
  };
  const recentActivation = activationRateForDays(window.toDay - 6, window.toDay);
  const priorActivation = activationRateForDays(window.toDay - 13, window.toDay - 7);
  const activationTrend = recentActivation === null || priorActivation === null
    ? "insufficient_data"
    : recentActivation > priorActivation ? "up" : recentActivation < priorActivation ? "down" : "flat";

  return {
    generated_at: now.toISOString(),
    range: { key: range, from: window.from, to: window.to },
    overview: {
      total_signups: totalSignups,
      signups_in_range: rangeSignupUsers.size,
      activated_users: activatedUsers,
      activation_rate_percent: percent(activatedUsers, totalSignups),
      active_users_in_range: activeInWindow.size,
      dau: activeSince(1),
      wau: activeSince(7),
      mau: activeSince(30),
    },
    retention: retainedByDay,
    features,
    funnel: {
      onboarding_available: true,
      signups: rangeSignupUsers.size,
      onboarding_completed: [...rangeSignupUsers].filter((userId) => completedOnboarding.has(userId)).length,
      activated: [...rangeSignupUsers].filter((userId) => activationUsers.has(userId)).length,
      retained_d1: retainedByDay[0].retained_users,
      retained_d7: retainedByDay[1].retained_users,
      retained_d30: retainedByDay[2].retained_users,
    },
    health: {
      sample_size: totalSignups,
      small_sample: totalSignups < 30,
      warning: totalSignups < 30 ? "Small sample — interpret percentages cautiously." : null,
      most_used_feature: featureUses === 0 ? null : sortedFeatures[0].key,
      least_used_feature: featureUses === 0 ? null : sortedFeatures[sortedFeatures.length - 1].key,
      feature_concentration_percent: featureUses === 0 ? null : percent(sortedFeatures[0].unique_users, featureUses),
      activation_trend: activationTrend,
    },
  };
}

function unavailable(): never {
  throw new PersistenceError(503, "analytics_reporting_unavailable", "Analytics reporting is temporarily unavailable.");
}

export function createBetaAnalyticsReportingService(env: ServerEnv) {
  const admin = createSupabaseAdminClient(env);

  async function loadEvents(): Promise<AnalyticsReportEvent[]> {
    const rows: AnalyticsReportEvent[] = [];
    for (let from = 0; from <= MAX_REPORT_ROWS; from += REPORT_PAGE_SIZE) {
      const result = await admin.from("product_events")
        .select("user_id,event_name,created_at")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, Math.min(from + REPORT_PAGE_SIZE - 1, MAX_REPORT_ROWS));
      if (result.error || !result.data) unavailable();
      rows.push(...result.data as AnalyticsReportEvent[]);
      if (rows.length > MAX_REPORT_ROWS) unavailable();
      if (result.data.length < REPORT_PAGE_SIZE) return rows;
    }
    unavailable();
  }

  async function loadParticipants(): Promise<AnalyticsReportParticipant[]> {
    const result = await admin.from("beta_participants")
      .select("user_id,onboarding_completed_at")
      .limit(MAX_REPORT_ROWS + 1);
    if (result.error || !result.data || result.data.length > MAX_REPORT_ROWS) unavailable();
    return result.data as AnalyticsReportParticipant[];
  }

  return {
    async report(range: BetaAnalyticsRange, now = new Date()): Promise<BetaAnalyticsReport> {
      const [events, participants] = await Promise.all([loadEvents(), loadParticipants()]);
      return buildBetaAnalyticsReport(events, participants, range, now);
    },
  };
}
