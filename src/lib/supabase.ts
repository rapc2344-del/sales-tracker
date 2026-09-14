import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;

  let url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    return null; // No credentials → fallback to in-memory store
  }

  // Strip trailing /rest/v1/ or trailing slash if entered by mistake
  url = url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");

  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return client;
}
