import { useCallback, useRef } from 'react';
import { useAuth } from '@clerk/expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '@/utils/supabase';
import type { ChatMessage } from '@/types/chat';

const MAX_PINS = 20;

// Pinned messages for a group, newest pin first. Kept as its own query (not derived from the
// message thread) because a pinned message can be older than anything loaded into the thread.
export function usePinnedMessages(groupId: string) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const queryClient = useQueryClient();
  const pinsKey = ['pins', groupId] as const;
  const messagesKey = ['messages', groupId] as const;

  const { data: pins = [] } = useQuery<ChatMessage[], Error>({
    queryKey: pinsKey,
    enabled: !!groupId,
    queryFn: async () => {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      const { data, error } = await getSupabaseClient(token)
        .from('messages')
        .select('*')
        .eq('group_id', groupId)
        .not('pinned_at', 'is', null)
        .is('deleted_at', null)
        .order('pinned_at', { ascending: false })
        .limit(MAX_PINS);
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
    staleTime: 60_000,
    // Pinning is a new database column; if the database doesn't have it yet this just shows no pins.
    retry: false,
  });

  const setPinned = useCallback(
    async (message: ChatMessage, pinned: boolean, userId: string) => {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      const patch = pinned
        ? { pinned_at: new Date().toISOString(), pinned_by: userId }
        : { pinned_at: null, pinned_by: null };
      const previous = { pinned_at: message.pinned_at ?? null, pinned_by: message.pinned_by ?? null };

      const applyToThread = (fields: Pick<ChatMessage, 'pinned_at' | 'pinned_by'>) =>
        queryClient.setQueryData<ChatMessage[]>(messagesKey, (prev) =>
          prev?.map((m) => (m.id === message.id ? { ...m, ...fields } : m))
        );
      // Optimistic: banner and list update instantly.
      applyToThread(patch);
      queryClient.setQueryData<ChatMessage[]>(pinsKey, (prev = []) =>
        pinned
          ? [{ ...message, ...patch }, ...prev.filter((m) => m.id !== message.id)].slice(0, MAX_PINS)
          : prev.filter((m) => m.id !== message.id)
      );

      const supabase = getSupabaseClient(token);
      // Any member may pin, so this goes through a database function (a plain update is limited to your own messages
      // once chat is locked down). Before that function exists, fall back to the direct update.
      let { error } = await supabase.rpc('set_message_pinned', { p_message_id: message.id, p_pinned: pinned });
      if (error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message))) {
        ({ error } = await supabase.from('messages').update(patch).eq('id', message.id));
      }
      if (error) {
        applyToThread(previous);
        queryClient.invalidateQueries({ queryKey: pinsKey });
        throw error;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupId, queryClient]
  );

  return { pins, pinMessage: (m: ChatMessage, userId: string) => setPinned(m, true, userId), unpinMessage: (m: ChatMessage, userId: string) => setPinned(m, false, userId) };
}
