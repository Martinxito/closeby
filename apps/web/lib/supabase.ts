import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The publishable (anon) key is public by design: the RLS policies in
// supabase/migrations/0001_deals.sql decide what it can read and write.
// NEXT_PUBLIC_* variables are inlined at build time, so after changing them in
// Vercel you must redeploy for the new values to take effect.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. See apps/web/.env.example.',
    );
  }
  // No Supabase Auth: identity comes from the wallet, so there is no session to keep.
  client ??= createClient(url, anonKey, { auth: { persistSession: false } });
  return client;
}
