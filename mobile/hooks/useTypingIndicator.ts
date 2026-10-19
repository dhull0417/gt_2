import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { getSupabaseClient } from '@/utils/supabase';

// "Someone is typing…" over Supabase Realtime *Broadcast*: one tiny event per few seconds while a
// person types. (The previous version used Presence, which re-synced every member's full state to
// everyone on each keystroke.) Each receiver keeps a short expiry per typer, so a typer who stops,
// closes the app, or loses signal disappears on their own.

const SEND_EVERY_MS = 2500; // at most one event this often while typing
const EXPIRE_AFTER_MS = 4000; // hide someone this long after their last event

interface TypingPayload {
  userId: string;
  name: string;
}

export function useTypingIndicator(groupId: string, userId: string, userName: string) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [typers, setTypers] = useState<Record<string, string>>({});
  const channelRef = useRef<any>(null);
  const realtimeClientRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  const subscribedRef = useRef(false);
  const lastSentRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const nameRef = useRef(userName);
  nameRef.current = userName;

  const removeTyper = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) clearTimeout(t);
    timersRef.current.delete(id);
    setTypers((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!userId || !groupId) return;
    let active = true;
    const timers = timersRef.current;

    const setup = async () => {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token || !active) return;
      const supabase = getSupabaseClient(token);
      realtimeClientRef.current = supabase;

      // See useMessages.ts: the client is shared by token, and supabase-js would otherwise hand
      // back a stale, already-subscribed channel for this topic on a fast remount.
      const topic = `realtime:typing:${groupId}`;
      const stale = supabase.getChannels().find((c) => c.topic === topic);
      if (stale) await supabase.removeChannel(stale);
      if (!active) return;

      const channel = supabase.channel(`typing:${groupId}`, { config: { broadcast: { self: false } } });
      channel
        .on('broadcast', { event: 'typing' }, ({ payload }: { payload: TypingPayload }) => {
          if (!active || !payload?.userId || payload.userId === userId) return;
          setTypers((prev) => (prev[payload.userId] === payload.name ? prev : { ...prev, [payload.userId]: payload.name }));
          const existing = timers.get(payload.userId);
          if (existing) clearTimeout(existing);
          timers.set(payload.userId, setTimeout(() => removeTyper(payload.userId), EXPIRE_AFTER_MS));
        })
        .subscribe((status) => {
          subscribedRef.current = status === 'SUBSCRIBED';
        });
      channelRef.current = channel;
    };
    setup();

    return () => {
      active = false;
      subscribedRef.current = false;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      setTypers({});
      if (channelRef.current) realtimeClientRef.current?.removeChannel(channelRef.current);
      channelRef.current = null;
      realtimeClientRef.current = null;
    };
  }, [groupId, userId, removeTyper]);

  const handleTyping = useCallback(() => {
    if (!channelRef.current || !subscribedRef.current) return;
    const now = Date.now();
    if (now - lastSentRef.current < SEND_EVERY_MS) return;
    lastSentRef.current = now;
    channelRef.current
      .send({ type: 'broadcast', event: 'typing', payload: { userId, name: nameRef.current } satisfies TypingPayload })
      ?.catch?.(() => {});
  }, [userId]);

  // A message from someone means they've stopped typing — clear them right away.
  const clearTypingFor = useCallback((id: string) => removeTyper(id), [removeTyper]);

  return { typingNames: Object.values(typers), handleTyping, clearTypingFor };
}
