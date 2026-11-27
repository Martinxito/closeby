// Importing this file from a Client Component fails the build: the secret key must
// never be bundled into code that runs in the browser.
import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The secret key (sb_secret_...) acts as service_role and bypasses RLS. The anon and
// authenticated roles have no privileges at all (supabase/migrations/0002_server_only_access.sql),
// so every read and write goes through our server, which validates it first.
// These variables have no NEXT_PUBLIC_ prefix, so Next.js never sends them to the browser.
const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (!url || !secretKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY. See apps/web/.env.example.');
  }
  // No Supabase Auth: identity comes from the wallet, so there is no session to keep.
  client ??= createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
