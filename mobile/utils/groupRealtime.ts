import type { useAuth } from '@clerk/expo';
import { getSupabaseClient } from './supabase';

type GetToken = ReturnType<typeof useAuth>['getToken'];

export const groupUpdatesChannel = (groupId: string) => `group-updates:${groupId}`;

// Best-effort ping over the Supabase Realtime channel useGetGroupDetails
// subscribes to, so other devices refetch immediately instead of waiting on
// React Query's staleTime. Mutation already succeeded server-side, so a
// missed broadcast just falls back to the normal refresh.
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
