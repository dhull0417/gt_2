import type { useAuth } from '@clerk/expo';
import { getSupabaseClient } from './supabase';

type GetToken = ReturnType<typeof useAuth>['getToken'];

export const groupUpdatesChannel = (groupId: string) => `group-updates:${groupId}`;

// Group membership/role data is plain REST + a cached React Query entry per
// device (see useGetGroupDetails), so a change made on one device is
// otherwise invisible to everyone else until their local cache goes stale.
// This broadcasts a lightweight "something changed" ping over the same
// Supabase Realtime channel useGetGroupDetails subscribes to, so every other
// device viewing this group refetches immediately instead of waiting.
// Best-effort: the mutation itself already succeeded on the server, so a
// missed broadcast just falls back to the existing staleTime-based refresh.
export async function broadcastGroupUpdate(getToken: GetToken, groupId: string) {
  try {
    const token = await getToken({ template: 'supabase' });
    if (!token) return;
    const supabase = getSupabaseClient(token);
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
