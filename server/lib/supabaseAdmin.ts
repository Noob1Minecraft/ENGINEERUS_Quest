import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ServerEnv } from "../config/env";

export function createSupabaseAdminClient(env: ServerEnv): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.supabaseConfigured) {
    throw new Error("Supabase server configuration is unavailable.");
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
