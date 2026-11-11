import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** One browser client per page load. */
export function supabaseBrowser(): SupabaseClient {
  if (!client) client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}

export type Shop = { id: string; owner_name: string | null; name: string | null; sells: string | null; theme: string | null; avatar?: string | null; usual_close_time?: string | null };
