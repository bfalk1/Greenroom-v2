import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function createClient() {
  if (client) return client;
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // During build/SSR without env vars, return a dummy client that won't crash
  if (!url || !key) {
    if (typeof window === "undefined") {
      // Server-side during build - return null-safe stub
      return null as unknown as SupabaseClient;
    }
    throw new Error("Supabase URL and anon key are required");
  }
  
  client = createBrowserClient(url, key);
  return client;
}
