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
  // Without this the realtime socket stays anonymous (it only uses the anon key), so once chat is locked
  // down to group members it would receive nothing. Keep it fresh with refreshRealtimeAuth() on long sessions.
  try { client.realtime.setAuth(clerkToken); } catch { /* realtime is optional */ }

  clientCache.set(clerkToken, client);
  if (clientCache.size > MAX_CACHED_CLIENTS) {
    const oldestKey = clientCache.keys().next().value;
    if (oldestKey !== undefined) clientCache.delete(oldestKey);
  }
  return client;
}

/**
 * Clerk tokens only live about a minute. A realtime channel authenticated with one stops being allowed to
 * receive rows after it expires, so call this on a timer while a channel is open with a freshly fetched token.
 */
export function refreshRealtimeAuth(client: SupabaseClient, freshToken: string) {
  try { client.realtime.setAuth(freshToken); } catch { /* ignore */ }
}

/**
 * Returns a brand-new channel for `name`, never a reused one.
 *
 * supabase-js hands back any channel already registered under the same topic, and removeChannel()
 * only unregisters it when the server acknowledges the leave with "ok". After a timeout or error
 * (fast remount, reconnect, dropped socket) the old, already-subscribed channel stays registered,
 * and calling .on() on it throws "cannot add `postgres_changes` callbacks ... after `subscribe()`".
 * So: try a clean removal, and if the channel is still registered afterwards, tear it down locally.
 */
export async function takeFreshChannel(
  client: SupabaseClient,
  name: string,
  params?: Parameters<SupabaseClient['channel']>[1],
) {
  const topic = `realtime:${name}`;
  const findStale = () => client.getChannels().find((c) => c.topic === topic);
  const stale = findStale();
  if (stale) {
    try { await client.removeChannel(stale); } catch { /* fall through to the forced removal */ }
    const still = findStale();
    if (still) {
      try { still.teardown(); } catch { /* ignore */ }
      const realtime = client.realtime as unknown as { _remove?: (c: unknown) => void; channels?: unknown[] };
      if (typeof realtime._remove === 'function') realtime._remove(still);
      else if (Array.isArray(realtime.channels)) realtime.channels = realtime.channels.filter((c) => c !== still);
    }
  }
  return client.channel(name, params);
}
