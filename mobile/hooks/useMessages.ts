import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@clerk/expo';
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/utils/supabase';
import { SEND_MESSAGE_MUTATION_KEY, type SendMessageVariables } from '@/utils/chatMutations';
import type { ChatMessage, PendingImage, ReactionResult } from '@/types/chat';
import { useIsOnline } from '@/hooks/useIsOnline';

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
  const isOnline = useIsOnline();

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

  // mutationFn lives in the shared registry (utils/chatMutations.ts), not here,
  // so a send that's paused for being offline can be resumed after an app
  // restart even before this screen (or any component) has remounted.
  const sendMessageMutation = useMutation<void, Error, SendMessageVariables>({
    mutationKey: SEND_MESSAGE_MUTATION_KEY,
  });
  const mutateSendMessage = sendMessageMutation.mutateAsync;

  const sendMessage = useCallback(
    (
      content: string,
      senderId: string,
      senderName: string,
      replyTo?: { id: string; content: string; senderName: string },
      image?: PendingImage
    ) => {
      return mutateSendMessage({
        clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        groupId,
        senderId,
        senderName,
        content,
        createdAt: new Date().toISOString(),
        replyTo,
        image,
      });
    },
    [groupId, mutateSendMessage]
  );

  // Queued/in-flight sends for this group, rendered as placeholders — covers
  // both a send still in flight and one paused offline (including one just
  // restored from disk after an app restart, before it's had a chance to send).
  const pendingSends = useMutationState<{ variables: SendMessageVariables; mutationId: number }>({
    filters: { mutationKey: SEND_MESSAGE_MUTATION_KEY, status: 'pending' },
    select: (mutation) => ({ variables: mutation.state.variables as SendMessageVariables, mutationId: mutation.mutationId }),
  });

  // Sends that exhausted their retries (see registerChatMutationDefaults) —
  // rendered as placeholders the user can tap to retry or discard.
  const failedSends = useMutationState<{ variables: SendMessageVariables; mutationId: number }>({
    filters: { mutationKey: SEND_MESSAGE_MUTATION_KEY, status: 'error' },
    select: (mutation) => ({ variables: mutation.state.variables as SendMessageVariables, mutationId: mutation.mutationId }),
  });

  const toPlaceholder = useCallback(
    (v: SendMessageVariables, mutationId: number, extra: Partial<ChatMessage>): ChatMessage => ({
      id: `pending-${v.clientId}`,
      group_id: v.groupId,
      sender_id: v.senderId,
      sender_name: v.senderName,
      content: v.content,
      created_at: v.createdAt,
      reply_to_id: v.replyTo?.id ?? null,
      reply_to_content: v.replyTo?.content ?? null,
      reply_to_sender: v.replyTo?.senderName ?? null,
      image_url: v.image?.url ?? null,
      image_width: v.image?.width ?? null,
      image_height: v.image?.height ?? null,
      mutationId,
      ...extra,
    }),
    []
  );

  const pendingMessages = useMemo<ChatMessage[]>(
    () =>
      pendingSends
        .filter((s) => s?.variables?.groupId === groupId)
        .map((s) => toPlaceholder(s.variables, s.mutationId, { pending: true })),
    [pendingSends, groupId, toPlaceholder]
  );

  const failedMessages = useMemo<ChatMessage[]>(
    () =>
      failedSends
        .filter((s) => s?.variables?.groupId === groupId)
        .map((s) => toPlaceholder(s.variables, s.mutationId, { failed: true })),
    [failedSends, groupId, toPlaceholder]
  );

  const messagesWithPending = useMemo(
    () =>
      pendingMessages.length || failedMessages.length
        ? [...messages, ...pendingMessages, ...failedMessages]
        : messages,
    [messages, pendingMessages, failedMessages]
  );

  // Retrying re-submits the exact original variables (same clientId, and
  // critically the same createdAt) so the message keeps its place in the
  // conversation instead of jumping to the resend time.
  const retrySend = useCallback(
    (mutationId: number) => {
      const cache = queryClient.getMutationCache();
      const mutation = cache.getAll().find((m) => m.mutationId === mutationId);
      if (!mutation) return;
      const variables = mutation.state.variables as SendMessageVariables;
      cache.remove(mutation);
      mutateSendMessage(variables).catch(() => {});
    },
    [queryClient, mutateSendMessage]
  );

  const discardSend = useCallback(
    (mutationId: number) => {
      const cache = queryClient.getMutationCache();
      const mutation = cache.getAll().find((m) => m.mutationId === mutationId);
      if (mutation) cache.remove(mutation);
    },
    [queryClient]
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
    // Also re-runs on reconnect (isOnline flips false -> true): the channel
    // from before going offline is torn down by this effect's own cleanup,
    // and a stale/dropped socket wouldn't otherwise resubscribe on its own,
    // silently missing any INSERT events sent while it was down.
    if (!groupId || !isOnline) return;
    let active = true;
    // Catches up on anything missed while disconnected, before the fresh
    // subscription below is listening.
    refetch();
    const setupRealtime = async () => {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token || !active) return;
      const supabase = getSupabaseClient(token);
      realtimeClientRef.current = supabase;

      // The client is shared/cached by token, and supabase-js reuses an
      // existing channel object for a topic that's still registered rather
      // than creating a new one. On a fast remount the previous mount's
      // async removeChannel() may not have finished yet, so without this
      // we'd get handed back the old, already-subscribed channel and
      // .on() would throw ("cannot add callbacks after subscribe()").
      const topic = `realtime:messages-${groupId}`;
      const stale = supabase.getChannels().find((c) => c.topic === topic);
      if (stale) await supabase.removeChannel(stale);
      if (!active) return;

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
      if (channelRef.current) realtimeClientRef.current?.removeChannel(channelRef.current);
      channelRef.current = null;
      realtimeClientRef.current = null;
    };
  }, [groupId, isOnline, queryClient, queryKey, refetch]);

  return { messages: messagesWithPending, loading, error, sendMessage, retrySend, discardSend, addReaction, deleteMessage, editMessage, refetch };
}
