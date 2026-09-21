import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Deliberately not tied to Clerk's useAuth() return type: this also gets called
// from utils/authToken.ts's getClerkToken (used outside the component tree, e.g.
// by a resumed offline mutation), which has the same shape but isn't a hook result.
export type GetToken = (options?: { template?: string }) => Promise<string | null>;

export const groupUpdatesChannel = (groupId: string) => `group-updates:${groupId}`;

// Broadcast events sent on a group's channel. Consumers subscribe to whichever
// ones affect the data they cache:
//  - 'updated'        group doc itself changed (members, moderators, owner, settings)
//  - 'meetup-updated' a meetup belonging to this group changed (RSVP, cancel, etc)
//  - 'poll-updated'   a poll belonging to this group changed (vote, create, cancel)
export type GroupBroadcastEvent = 'updated' | 'meetup-updated' | 'poll-updated';

// Best-effort ping over a Supabase Realtime channel so other devices refetch
// immediately instead of waiting on React Query's staleTime. The mutation
// already succeeded server-side, so a missed broadcast just falls back to the
// normal refresh.
//
// Deliberately uses its own short-lived client instead of the shared cached
// one from utils/supabase.ts: this connection is opened and torn down
// immediately after the broadcast, so caching it would provide no benefit.
async function broadcastToGroupChannel(getToken: GetToken, groupId: string, event: GroupBroadcastEvent) {
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
        channel.send({ type: 'broadcast', event, payload: {} });
        supabase.removeChannel(channel);
      }
    });
  } catch {
    // no-op — see comment above
  }
}

export function broadcastGroupUpdate(getToken: GetToken, groupId: string) {
  return broadcastToGroupChannel(getToken, groupId, 'updated');
}

export function broadcastMeetupUpdate(getToken: GetToken, groupId: string) {
  return broadcastToGroupChannel(getToken, groupId, 'meetup-updated');
}

export function broadcastPollUpdate(getToken: GetToken, groupId: string) {
  return broadcastToGroupChannel(getToken, groupId, 'poll-updated');
}
