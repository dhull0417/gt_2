import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { Alert } from 'react-native';
import { useApiClient, groupApi } from '@/utils/api';
import { broadcastGroupUpdate } from '@/utils/groupRealtime';
import { getErrorMessage } from '@/utils/networkError';
import { toast } from '@/contexts/ToastContext';
import { TIMEOUT_OPTIONS, type TimeoutKey } from '@/utils/chatTimeout';
import type { ChatMessage } from '@/types/chat';

/**
 * Owner/moderator chat tools for one group: delete anyone's message, time someone out, end a timeout.
 * After a timeout change the group's other phones are told to refresh, so a timed-out person's open
 * chat locks (or unlocks) within seconds. See docs/specs/2026-11-16-chat-moderation-design.md.
 */
export function useChatModeration(groupId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const messagesKey = ['messages', groupId];

  const refreshGroup = () => {
    queryClient.invalidateQueries({ queryKey: ['groupDetails', groupId] });
    broadcastGroupUpdate(getToken, groupId);
  };
  const showError = (title: string) => (error: unknown) => Alert.alert(title, getErrorMessage(error, 'Please try again.'));

  const timeOut = useMutation({
    mutationFn: ({ userId, duration }: { userId: string; duration: TimeoutKey }) =>
      groupApi.setChatTimeout(api, groupId, userId, duration),
    onSuccess: (_d, { duration }) => {
      const label = TIMEOUT_OPTIONS.find((o) => o.key === duration)?.label ?? '';
      toast.success(duration === 'indefinite' ? 'Timed out indefinitely' : `Timed out for ${label}`);
      refreshGroup();
    },
    onError: showError("Couldn't time out"),
  });

  const endTimeout = useMutation({
    mutationFn: (userId: string) => groupApi.clearChatTimeout(api, groupId, userId),
    onSuccess: () => {
      toast.success('Timeout ended');
      refreshGroup();
    },
    onError: showError("Couldn't end the timeout"),
  });

  // Same look as deleting your own: the bubble turns into "message deleted" right away and comes
  // back if the server refuses. Other phones get the change through the chat's realtime feed.
  const modDelete = useMutation({
    mutationFn: (messageId: string) => groupApi.modDeleteMessage(api, groupId, messageId),
    onMutate: (messageId: string) => {
      const before = queryClient.getQueryData<ChatMessage[]>(messagesKey)?.find((m) => m.id === messageId);
      const now = new Date().toISOString();
      queryClient.setQueryData<ChatMessage[]>(messagesKey, (prev) =>
        prev?.map((m) => (m.id === messageId ? { ...m, deleted_at: now } : m)));
      return { before };
    },
    onError: (error, messageId, context) => {
      const before = context?.before;
      if (before) {
        queryClient.setQueryData<ChatMessage[]>(messagesKey, (prev) =>
          prev?.map((m) => (m.id === messageId ? before : m)));
      }
      showError("Couldn't delete the message")(error);
    },
  });

  return {
    timeOut: (userId: string, duration: TimeoutKey) => timeOut.mutate({ userId, duration }),
    endTimeout: (userId: string) => endTimeout.mutate(userId),
    modDelete: (messageId: string) => modDelete.mutate(messageId),
    busy: timeOut.isPending || endTimeout.isPending,
  };
}
