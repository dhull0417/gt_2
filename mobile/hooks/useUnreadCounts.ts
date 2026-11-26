import { useMemo, useRef } from 'react';
import { useAuth } from '@clerk/expo';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '@/utils/supabase';

export interface UnreadInfo {
  unread: number;
  mentioned: number;
}

interface Candidate {
  groupId: string;
  /** Last time this user opened the chat; empty = never. */
  lastReadAt: string;
}

// Real unread counts ("12", "@" when you were mentioned) for the groups list. Only asked for the
// groups already known to have something unread (the server-side lastMessage vs lastReadAt check),
// in a single database call. If the call fails (e.g. the database function isn't deployed yet) the
// map is simply empty and the list falls back to its plain unread dot.
export function useUnreadCounts(candidates: Candidate[]) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const signature = useMemo(
    () => candidates.map((c) => `${c.groupId}@${c.lastReadAt}`).sort().join('|'),
    [candidates]
  );

  const { data } = useQuery<Record<string, UnreadInfo>, Error>({
    queryKey: ['unreadCounts', signature],
    enabled: candidates.length > 0,
    placeholderData: keepPreviousData,
    gcTime: 60_000,
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      const reads: Record<string, string> = {};
      for (const c of candidates) reads[c.groupId] = c.lastReadAt;
      const { data: rows, error } = await getSupabaseClient(token).rpc('unread_counts', { p_reads: reads });
      if (error) throw error;
      const out: Record<string, UnreadInfo> = {};
      for (const r of (rows ?? []) as { group_id: string; unread: number; mentioned: number }[]) {
        out[r.group_id] = { unread: r.unread, mentioned: r.mentioned };
      }
      return out;
    },
  });

  return data ?? {};
}
