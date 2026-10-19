import type { QueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '@/utils/supabase';
import { getClerkToken } from '@/utils/authToken';
import type { ChatMessage, PendingImage } from '@/types/chat';

// Shared by every group's chat screen — variables carry groupId, so one
// registration covers all of them. Registering the mutationFn on the
// QueryClient (rather than passing it to each useMutation call) is required
// for offline queuing: a mutation paused while offline and restored from
// AsyncStorage after an app restart has no live closure to call, only this
// looked-up-by-key default.
export const SEND_MESSAGE_MUTATION_KEY = ['sendMessage'] as const;

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

export function registerChatMutationDefaults(queryClient: QueryClient) {
  queryClient.setMutationDefaults(SEND_MESSAGE_MUTATION_KEY, {
    retry: MAX_SEND_RETRIES,
    retryDelay: RETRY_DELAY_MS,
    // Goes through the send_message() database function, which is idempotent on
    // (sender, client_id): if an earlier attempt actually reached the database but its
    // response was lost, the retry gets that same row back instead of inserting a
    // duplicate. Returns the saved row so the caller can show it immediately.
    mutationFn: async (vars: SendMessageVariables): Promise<ChatMessage> => {
      const token = await getClerkToken({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      const supabase = getSupabaseClient(token);
      const { data, error } = await supabase.rpc('send_message', {
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
        p_image_url: vars.image?.url ?? null,
        p_image_width: vars.image?.width ?? null,
        p_image_height: vars.image?.height ?? null,
      });
      if (error) throw error;
      return data as ChatMessage;
    },
  });
}
