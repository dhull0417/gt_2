import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@clerk/expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/utils/supabase';
import type { ChatMessage, PendingImage, ReactionResult } from '@/types/chat';

// Only the most recent page is fetched/cached — no pagination yet.
const MESSAGE_PAGE_SIZE = 50;

export function useMessages(groupId: string) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['messages', groupId] as const, [groupId]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const realtimeClientRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null);

  const fetchMessages = useCallback(async (): Promise<ChatMessage[]> => {
    const token = await getTokenRef.current({ template: 'supabase' });
    if (!token) throw new Error('No auth token');
    const supabase = getSupabaseClient(token);
    const { data, error: sbError } = await supabase
      .from('messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    if (sbError) throw sbError;
    return (data ?? []).reverse();
  }, [groupId]);

  const { data: messages = [], isLoading: loading, error, refetch } = useQuery<ChatMessage[], Error>({
    queryKey,
    queryFn: fetchMessages,
    enabled: !!groupId,
  });

  const sendMessage = useCallback(
    async (
      content: string,
      senderId: string,
      senderName: string,
      replyTo?: { id: string; content: string; senderName: string },
      image?: PendingImage
    ) => {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      const supabase = getSupabaseClient(token);
      const { error: sbError } = await supabase.from('messages').insert({
        group_id: groupId,
        sender_id: senderId,
        sender_name: senderName,
        content,
        ...(image && {
          image_url: image.url,
          ...(image.width && { image_width: image.width }),
          ...(image.height && { image_height: image.height }),
        }),
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

      const current = queryClient.getQueryData<ChatMessage[]>(queryKey)?.find((m) => m.id === messageId);
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

      queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) =>
        prev?.map((m) => (m.id === messageId ? { ...m, reactions: newReactions } : m))
      );

      const supabase = getSupabaseClient(token);
      const { error: sbError } = await supabase
        .from('messages').update({ reactions: newReactions }).eq('id', messageId);

      if (sbError) {
        queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) =>
          prev?.map((m) => (m.id === messageId ? { ...m, reactions: existing } : m))
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
    [groupId, queryClient, queryKey]
  );

  const deleteMessage = useCallback(async (messageId: string) => {
    const token = await getTokenRef.current({ template: 'supabase' });
    if (!token) throw new Error('No auth token');
    const now = new Date().toISOString();
    queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) =>
      prev?.map((m) => (m.id === messageId ? { ...m, deleted_at: now } : m))
    );
    const supabase = getSupabaseClient(token);
    const { error: sbError } = await supabase
      .from('messages').update({ deleted_at: now }).eq('id', messageId);
    if (sbError) {
      queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) =>
        prev?.map((m) => (m.id === messageId ? { ...m, deleted_at: null } : m))
      );
      throw sbError;
    }
  }, [groupId, queryClient, queryKey]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    const token = await getTokenRef.current({ template: 'supabase' });
    if (!token) throw new Error('No auth token');
    const original = queryClient.getQueryData<ChatMessage[]>(queryKey)?.find((m) => m.id === messageId);
    const now = new Date().toISOString();
    queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) =>
      prev?.map((m) => (m.id === messageId ? { ...m, content: newContent, edited_at: now } : m))
    );
    const supabase = getSupabaseClient(token);
    const { error: sbError } = await supabase
      .from('messages').update({ content: newContent, edited_at: now }).eq('id', messageId);
    if (sbError) {
      queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) =>
        prev?.map((m) => (m.id === messageId && original ? original : m))
      );
      throw sbError;
    }
  }, [groupId, queryClient, queryKey]);

  useEffect(() => {
    if (!groupId) return;
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
          (payload) => {
            if (!active) return;
            const incoming = payload.new as ChatMessage;
            queryClient.setQueryData<ChatMessage[]>(queryKey, (prev = []) =>
              prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
            );
          }
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
          (payload) => {
            if (!active) return;
            queryClient.setQueryData<ChatMessage[]>(queryKey, (prev = []) =>
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
  }, [groupId, queryClient, queryKey]);

  return { messages, loading, error, sendMessage, addReaction, deleteMessage, editMessage, refetch };
}
