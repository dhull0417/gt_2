import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/expo';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/utils/supabase';
import type { ChatMessage, ReactionResult } from '@/types/chat';

export function useMessages(groupId: string) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const realtimeClientRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const fetchMessages = useCallback(async () => {
    try {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      const supabase = getSupabaseClient(token);
      const { data, error: sbError } = await supabase
        .from('messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });
      if (sbError) throw sbError;
      setMessages(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch messages'));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const sendMessage = useCallback(
    async (
      content: string,
      senderId: string,
      senderName: string,
      replyTo?: { id: string; content: string; senderName: string }
    ) => {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      const supabase = getSupabaseClient(token);
      const { error: sbError } = await supabase.from('messages').insert({
        group_id: groupId,
        sender_id: senderId,
        sender_name: senderName,
        content,
        ...(replyTo && {
          reply_to_id: replyTo.id,
          reply_to_content: replyTo.content,
          reply_to_sender: replyTo.senderName,
        }),
      });
      if (sbError) throw sbError;
    },
    [groupId]
  );

  const addReaction = useCallback(
    async (messageId: string, emoji: string, userId: string): Promise<ReactionResult> => {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token) throw new Error('No auth token');

      const current = messagesRef.current.find((m) => m.id === messageId);
      const existing = current?.reactions ?? {};

      let previousEmoji: string | undefined;
      for (const [e, users] of Object.entries(existing)) {
        if (users.includes(userId)) { previousEmoji = e; break; }
      }

      const newReactions = { ...existing };
      if (previousEmoji) {
        const filtered = (newReactions[previousEmoji] ?? []).filter((id) => id !== userId);
        if (filtered.length === 0) delete newReactions[previousEmoji];
        else newReactions[previousEmoji] = filtered;
      }

      let action: ReactionResult['action'];
      if (previousEmoji === emoji) {
        action = 'removed';
      } else {
        action = previousEmoji ? 'changed' : 'added';
        newReactions[emoji] = [...(newReactions[emoji] ?? []), userId];
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: newReactions } : m))
      );

      const supabase = getSupabaseClient(token);
      const { error: sbError } = await supabase
        .from('messages').update({ reactions: newReactions }).eq('id', messageId);

      if (sbError) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions: existing } : m))
        );
        throw sbError;
      }

      return {
        action,
        emoji: action === 'removed' ? previousEmoji! : emoji,
        previousEmoji: action === 'changed' ? previousEmoji : undefined,
        messageId,
        senderId: current?.sender_id ?? '',
        senderName: current?.sender_name ?? '',
      };
    },
    [groupId]
  );

  const deleteMessage = useCallback(async (messageId: string) => {
    const token = await getTokenRef.current({ template: 'supabase' });
    if (!token) throw new Error('No auth token');
    const now = new Date().toISOString();
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deleted_at: now } : m)));
    const supabase = getSupabaseClient(token);
    const { error: sbError } = await supabase
      .from('messages').update({ deleted_at: now }).eq('id', messageId);
    if (sbError) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deleted_at: null } : m)));
      throw sbError;
    }
  }, [groupId]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    const token = await getTokenRef.current({ template: 'supabase' });
    if (!token) throw new Error('No auth token');
    const original = messagesRef.current.find((m) => m.id === messageId);
    const now = new Date().toISOString();
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: newContent, edited_at: now } : m))
    );
    const supabase = getSupabaseClient(token);
    const { error: sbError } = await supabase
      .from('messages').update({ content: newContent, edited_at: now }).eq('id', messageId);
    if (sbError) {
      setMessages((prev) => prev.map((m) => (m.id === messageId && original ? original : m)));
      throw sbError;
    }
  }, [groupId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    let active = true;
    const setupRealtime = async () => {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token || !active) return;
      const supabase = getSupabaseClient(token);
      realtimeClientRef.current = supabase;
      const channel = supabase
        .channel(`messages-${groupId}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
          (payload) => { if (active) setMessages((prev) => [...prev, payload.new as ChatMessage]); }
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
          (payload) => {
            if (active) setMessages((prev) =>
              prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m))
            );
          }
        )
        .subscribe();
      channelRef.current = channel;
    };
    setupRealtime();
    return () => {
      active = false;
      realtimeClientRef.current?.removeAllChannels();
      channelRef.current = null;
      realtimeClientRef.current = null;
    };
  }, [groupId]);

  return { messages, loading, error, sendMessage, addReaction, deleteMessage, editMessage, refetch: fetchMessages };
}
