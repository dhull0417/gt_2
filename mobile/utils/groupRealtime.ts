import type { useAuth } from '@clerk/expo';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

type GetToken = ReturnType<typeof useAuth>['getToken'];

export const groupUpdatesChannel = (groupId: string) => `group-updates:${groupId}`;

// Best-effort ping over the Supabase Realtime channel useGetGroupDetails
// subscribes to, so other devices refetch immediately instead of waiting on
// React Query's staleTime. Mutation already succeeded server-side, so a
// missed broadcast just falls back to the normal refresh.
//
// Deliberately uses its own short-lived client instead of the shared cached
// one from utils/supabase.ts: this connection is opened and torn down
// immediately after the broadcast, so caching it would provide no benefit.
export async function broadcastGroupUpdate(getToken: GetToken, groupId: string) {
  try {
    const token = await getToken({ template: 'supabase' });
    if (!token) return;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const channel = supabase.channel(groupUpdatesChannel(groupId));
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({ type: 'broadcast', event: 'updated', payload: {} });
        supabase.removeChannel(channel);
      }
    });
  } catch {
    // no-op — see comment above
  }
}
