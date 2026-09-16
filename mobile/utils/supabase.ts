import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Clerk caches each token for ~60s, so calls made within that window share the
// same token string. Reusing the client for a given token lets realtime hooks
// that mount together (messages, group updates, typing) multiplex their
// channels over one WebSocket instead of each opening its own connection.
// Capped so a long session doesn't grow this unboundedly as tokens rotate.
const clientCache = new Map<string, SupabaseClient>();
const MAX_CACHED_CLIENTS = 5;

export function getSupabaseClient(clerkToken: string) {
  const cached = clientCache.get(clerkToken);
  if (cached) return cached;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${clerkToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  clientCache.set(clerkToken, client);
  if (clientCache.size > MAX_CACHED_CLIENTS) {
    const oldestKey = clientCache.keys().next().value;
    if (oldestKey !== undefined) clientCache.delete(oldestKey);
  }
  return client;
}
