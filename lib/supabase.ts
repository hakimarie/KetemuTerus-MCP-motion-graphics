import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

export const VIDEO_BUCKET = "motion-studio";