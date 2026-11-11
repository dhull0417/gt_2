import type { QueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '@/utils/supabase';
import { waitForClerkToken } from '@/utils/authToken';
import { uploadImageFromUriWithDimensions } from '@/utils/uploadImage';
import type { ChatMessage, PendingImage, ReactionResult } from '@/types/chat';
import { authedApi } from '@/utils/authedApi';
import { NoTokenError, queuedRetry, queuedRetryDelay } from '@/utils/queuedMutations';
import { userApi } from '@/utils/api';
import { applyReactionToggle, undoReactionToggle, upsertMessage } from '@/utils/chatCache';

// Shared by every group's chat screen — variables carry groupId, so one
// registration covers all of them. Registering the mutationFn on the
// QueryClient (rather than passing it to each useMutation call) is required
// for offline queuing: a mutation paused while offline and restored from
// AsyncStorage after an app restart has no live closure to call, only this
// looked-up-by-key default.
export const SEND_MESSAGE_MUTATION_KEY = ['sendMessage'] as const;
export const TOGGLE_REACTION_MUTATION_KEY = ['toggleReaction'] as const;
export const MARK_GROUP_READ_MUTATION_KEY = ['markGroupRead'] as const;

export interface ToggleReactionVariables {
  messageId: string;
  groupId: string;
  emoji: string;
  /** My Clerk id. */
  userId: string;
  /** My display name, for the reaction push. */
  senderName: string;
}

export interface SendMessageVariables {
  clientId: string;
  groupId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  replyTo?: { id: string; content: string; senderName: string };
  image?: PendingImage;
  // Clerk ids of people @mentioned in the text.
  mentions?: string[];
}

// Covers a request that fails while NetInfo still reports "connected" (DNS
// hiccup, a Supabase 5xx, a timeout on a flaky-but-technically-up
// connection) — that path never goes through the offline pause/resume flow
// above, so without this it would fail permanently on the first bad attempt.
// 6 attempts at 2s/4s/8s/15s/15s/15s ~= 59s of retrying before giving up.
const MAX_SEND_RETRIES = 6;
const RETRY_DELAY_MS = (attemptIndex: number) => Math.min(2000 * 2 ** attemptIndex, 15000);

export function chatPhotoPath(groupId: string, clientId: string): string {
  return `chat/${groupId}/${clientId}.jpg`;
}

/** The send_message() arguments. Goes through that database function, which is idempotent on
 * (sender, client_id): if an earlier attempt reached the database but its response was lost, the
 * retry gets the same row back instead of inserting a duplicate. */
export function buildSendRpcArgs(
  vars: SendMessageVariables,
  uploaded?: { url: string; width?: number; height?: number },
): Record<string, unknown> {
  const image = uploaded ?? vars.image;
  return {
    // Only sent when there are mentions, so ordinary sends keep working even before the
    // database has the p_mentions version of the function.
    ...(vars.mentions && vars.mentions.length > 0 ? { p_mentions: vars.mentions } : {}),
    p_client_id: vars.clientId,
    p_group_id: vars.groupId,
    p_sender_name: vars.senderName,
    p_content: vars.content,
    p_reply_to_id: vars.replyTo?.id ?? null,
    p_reply_to_content: vars.replyTo?.content ?? null,
    p_reply_to_sender: vars.replyTo?.senderName ?? null,
    p_image_url: image?.url ?? null,
    p_image_width: image?.width ?? null,
    p_image_height: image?.height ?? null,
  };
}

export function registerChatMutationDefaults(queryClient: QueryClient) {
  queryClient.setMutationDefaults(SEND_MESSAGE_MUTATION_KEY, {
    // Queued offline (the client default is 'always' - see app/_layout.tsx).
    networkMode: 'online',
    // Kept until sent or discarded: a failed message's red bubble (Retry / Discard) must not be
    // garbage-collected after React Query's default 5 minutes.
    gcTime: Infinity,
    retry: MAX_SEND_RETRIES,
    retryDelay: RETRY_DELAY_MS,
    // Goes through the send_message() database function, which is idempotent on
    // (sender, client_id): if an earlier attempt actually reached the database but its
    // response was lost, the retry gets that same row back instead of inserting a
    // duplicate. Returns the saved row so the caller can show it immediately.
    mutationFn: async (vars: SendMessageVariables): Promise<ChatMessage> => {
      const token = await waitForClerkToken({ template: 'supabase' });
      if (!token) throw new NoTokenError();
      // A photo picked offline is queued with just its local file; upload it now. The file is named
      // after the message, so a retry overwrites the same file instead of leaving a duplicate.
      const uploaded = vars.image?.localUri && !vars.image.url
        ? await uploadImageFromUriWithDimensions(vars.image.localUri, 'chat-images', chatPhotoPath(vars.groupId, vars.clientId), token)
        : undefined;
      const supabase = getSupabaseClient(token);
      const { data, error } = await supabase.rpc('send_message', buildSendRpcArgs(vars, uploaded));
      if (error) throw error;
      return data as ChatMessage;
    },
  });

  // Reactions are queued too: tapped offline, the bubble updates right away and the change is sent
  // when the connection is back. No automatic retries: the server toggles, so re-sending one whose
  // reply was lost would undo it (a real failure is undone locally and the chat reloads).
  queryClient.setMutationDefaults(TOGGLE_REACTION_MUTATION_KEY, {
    networkMode: 'online',
    // Only "not signed in yet" is retried (nothing was sent, so it can't double-toggle).
    retry: (failureCount: number, error: unknown) => error instanceof NoTokenError && failureCount < 20,
    retryDelay: 1500,
    onMutate: async (v: ToggleReactionVariables): Promise<{ result?: ReactionResult }> => {
      const key = ['messages', v.groupId];
      const current = queryClient.getQueryData<ChatMessage[]>(key);
      if (!current) return {};
      const { messages, result } = applyReactionToggle(current, v.messageId, v.emoji, v.userId);
      queryClient.setQueryData<ChatMessage[]>(key, messages);
      return { result };
    },
    mutationFn: async (v: ToggleReactionVariables): Promise<ChatMessage | null> => {
      const token = await waitForClerkToken({ template: 'supabase' });
      if (!token) throw new NoTokenError();
      const supabase = getSupabaseClient(token);
      const { data: saved, error } = await supabase.rpc('toggle_reaction', { p_message_id: v.messageId, p_emoji: v.emoji });
      let row = saved as ChatMessage | null;
      if (error && (error.code === 'PGRST202' || error.code === '42883')) {
        // Database predates toggle_reaction: write the whole reactions object as it now stands here.
        const local = queryClient.getQueryData<ChatMessage[]>(['messages', v.groupId])?.find((m) => m.id === v.messageId);
        const legacy = await supabase.from('messages').update({ reactions: local?.reactions ?? {} }).eq('id', v.messageId);
        if (legacy.error) throw legacy.error;
        row = null;
      } else if (error) {
        throw error;
      }
      // Tell the message's author (only when a reaction was added or changed, not removed).
      // Sent from here rather than the screen so it still goes out if the chat was closed meanwhile.
      const reactedNow = row ? !!row.reactions?.[v.emoji]?.includes(v.userId) : true;
      if (reactedNow) {
        const authorId = (row ?? queryClient.getQueryData<ChatMessage[]>(['messages', v.groupId])?.find((m) => m.id === v.messageId))?.sender_id;
        authedApi.post(`/api/groups/${v.groupId}/chat-reaction`, {
          emoji: v.emoji,
          senderName: v.senderName,
          // Lets the server notify just the message's author instead of the whole group.
          authorId: authorId || undefined,
        }).catch(() => {});
      }
      return row;
    },
    onSuccess: (row: ChatMessage | null, v: ToggleReactionVariables) => {
      if (row?.id) queryClient.setQueryData<ChatMessage[]>(['messages', v.groupId], (prev) => (prev ? upsertMessage(prev, row) : prev));
    },
    onError: (_e: unknown, v: ToggleReactionVariables, context: { result?: ReactionResult } | undefined) => {
      if (!context?.result) return;
      const result = context.result;
      queryClient.setQueryData<ChatMessage[]>(['messages', v.groupId], (prev) => (prev ? undoReactionToggle(prev, result, v.userId) : prev));
    },
  });

  // "I've read this chat", queued so it isn't lost offline (the unread badge used to stick).
  // Only the latest one per chat is kept (queueMutation coalesces it).
  queryClient.setMutationDefaults(MARK_GROUP_READ_MUTATION_KEY, {
    networkMode: 'online',
    retry: queuedRetry,
    retryDelay: queuedRetryDelay,
    mutationFn: ({ groupId }: { groupId: string }) => userApi.markGroupRead(authedApi, groupId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
  });
}
