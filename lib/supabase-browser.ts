import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAccessToken } from "./read-pass";

let client: SupabaseClient | null = null;

// Read-only client for the browser (publishable key + read pass in Authorization).
export function supabaseBrowser() {
  if (!client) {
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      accessToken: async () => (await getAccessToken()) ?? "",
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
