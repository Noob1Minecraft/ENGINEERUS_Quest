import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ServerEnv } from "../config/env";

export function createSupabaseUserClient(
  env: ServerEnv,
  accessToken: string,
): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.supabaseConfigured) {
    throw new Error("Supabase server configuration is unavailable.");
  }

  if (!accessToken.trim()) {
    throw new Error("A verified Supabase access token is required.");
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
