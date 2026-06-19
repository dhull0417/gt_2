import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { getSupabaseClient } from '@/utils/supabase';

export function useTypingIndicator(groupId: string, userId: string, userName: string) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [typingNames, setTypingNames] = useState<string[]>([]);
  const channelRef = useRef<any>(null);
  const realtimeClientRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const setup = async () => {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token || !active) return;
      const supabase = getSupabaseClient(token);
      realtimeClientRef.current = supabase;
      const channel = supabase.channel(`typing:${groupId}`, {
        config: { presence: { key: userId } },
      });
      channel
        .on('presence', { event: 'sync' }, () => {
          if (!active) return;
          const state = channel.presenceState<{ name: string; typing: boolean }>();
          const names = Object.entries(state)
            .filter(([key, presences]) => key !== userId && presences[0]?.typing)
            .map(([, presences]) => presences[0].name);
          setTypingNames(names);
        })
        .subscribe();
      channelRef.current = channel;
    };
    setup();
    return () => {
      active = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      realtimeClientRef.current?.removeAllChannels();
      channelRef.current = null;
      realtimeClientRef.current = null;
    };
  }, [groupId, userId]);

  const handleTyping = useCallback(() => {
    if (!channelRef.current) return;
    channelRef.current.track({ name: userName, typing: true });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      channelRef.current?.track({ name: userName, typing: false });
    }, 2000);
  }, [userName]);

  return { typingNames, handleTyping };
}
