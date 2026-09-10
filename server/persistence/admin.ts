import type { ServerEnv } from "../config/env";
import { createSupabaseUserClient } from "../lib/supabaseUser";
import { PersistenceError } from "./errors";

export type AdminFeedbackStatus = "new" | "reviewed" | "resolved";

export type AdminFeedback = {
  id: string;
  category: string;
  rating: number;
  product_area: string;
  message: string;
  status: AdminFeedbackStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  submitter_id: string;
  submitter_username: string | null;
  submitter_display_name: string | null;
  submitter_avatar_url: string | null;
};

export type AdminSummary = {
  user_id: string;
  role: "admin";
  granted_at: string;
  granted_by: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type AdminUserSearchResult = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
};

export type AdminFeedbackCursor = { createdAt: string; id: string };

function failure(error: { code?: string; message?: string } | null): never {
  const databaseMessage = error?.message?.split("\n")[0]?.trim() || "admin_unavailable";
  if (databaseMessage === "admin_forbidden" || error?.code === "42501") {
    throw new PersistenceError(403, "admin_forbidden", "Administrator access is required.");
  }
  if (databaseMessage.endsWith("_not_found") || error?.code === "P0002") {
    throw new PersistenceError(404, databaseMessage, "The requested admin resource was not found.");
  }
  if (databaseMessage === "last_admin_required") {
    throw new PersistenceError(409, databaseMessage, "The final administrator cannot be removed.");
  }
  if (databaseMessage.startsWith("invalid_") || error?.code === "22023") {
    throw new PersistenceError(400, databaseMessage, "The admin request is invalid.");
  }
  throw new PersistenceError(503, "admin_unavailable", "Administrator services are temporarily unavailable.");
}

export type AdminRepository = {
  isAdmin(accessToken: string): Promise<boolean>;
  listFeedback(accessToken: string, limit: number, cursor?: AdminFeedbackCursor): Promise<{ feedback: AdminFeedback[]; next_cursor: AdminFeedbackCursor | null }>;
  getFeedback(accessToken: string, feedbackId: string): Promise<AdminFeedback>;
  updateFeedbackStatus(accessToken: string, feedbackId: string, status: AdminFeedbackStatus): Promise<AdminFeedback>;
  listAdmins(accessToken: string): Promise<AdminSummary[]>;
  searchUsers(accessToken: string, query: string, limit: number): Promise<AdminUserSearchResult[]>;
  grantAdmin(accessToken: string, userId: string): Promise<AdminSummary>;
  revokeAdmin(accessToken: string, userId: string): Promise<void>;
};

export function createAdminRepository(env: ServerEnv): AdminRepository {
  const client = (accessToken: string) => createSupabaseUserClient(env, accessToken);

  return {
    async isAdmin(accessToken) {
      const { data, error } = await client(accessToken).rpc("is_admin");
      if (error) failure(error);
      return data === true;
    },

    async listFeedback(accessToken, limit, cursor) {
      const { data, error } = await client(accessToken).rpc("admin_list_feedback", {
        p_limit: limit + 1,
        p_before_created_at: cursor?.createdAt ?? null,
        p_before_id: cursor?.id ?? null,
      });
      if (error) failure(error);
      const rows = (data ?? []) as AdminFeedback[];
      const feedback = rows.slice(0, limit);
      const last = rows.length > limit ? feedback.at(-1) : undefined;
      return {
        feedback,
        next_cursor: last ? { createdAt: last.created_at, id: last.id } : null,
      };
    },

    async getFeedback(accessToken, feedbackId) {
      const { data, error } = await client(accessToken).rpc("admin_get_feedback", {
        p_feedback_id: feedbackId,
      });
      if (error || !Array.isArray(data) || !data[0]) failure(error);
      return data[0] as AdminFeedback;
    },

    async updateFeedbackStatus(accessToken, feedbackId, status) {
      const { data, error } = await client(accessToken).rpc("admin_update_feedback_status", {
        p_feedback_id: feedbackId,
        p_status: status,
      });
      if (error || !Array.isArray(data) || !data[0]) failure(error);
      return data[0] as AdminFeedback;
    },

    async listAdmins(accessToken) {
      const { data, error } = await client(accessToken).rpc("admin_list_admins");
      if (error) failure(error);
      return (data ?? []) as AdminSummary[];
    },

    async searchUsers(accessToken, query, limit) {
      const { data, error } = await client(accessToken).rpc("admin_search_users", {
        p_query: query,
        p_limit: limit,
      });
      if (error) failure(error);
      return (data ?? []) as AdminUserSearchResult[];
    },

    async grantAdmin(accessToken, userId) {
      const { data, error } = await client(accessToken).rpc("admin_grant_role", {
        p_target_user_id: userId,
      });
      if (error || !Array.isArray(data) || !data[0]) failure(error);
      return data[0] as AdminSummary;
    },

    async revokeAdmin(accessToken, userId) {
      const { data, error } = await client(accessToken).rpc("admin_revoke_role", {
        p_target_user_id: userId,
      });
      if (error || data !== true) failure(error);
    },
  };
}
