import { useCallback } from "react";
import { onlineManager, useMutationState, useQueryClient } from "@tanstack/react-query";
import { VOTE_POLL_MUTATION_KEY, type VotePollVariables } from "../utils/offlineMutations";
import { queueMutation } from "../utils/queuedMutations";
import { toast } from '@/contexts/ToastContext';

// Votes are queued: cast offline, they're saved and sent when the connection is back (the latest
// choice per poll wins). The list refresh, the realtime ping and the error toast are global
// (app/_layout.tsx), so they still happen if this screen has closed by then.
export const useVotePoll = () => {
  const queryClient = useQueryClient();
  const pending = useMutationState({
    filters: { mutationKey: VOTE_POLL_MUTATION_KEY, status: 'pending' },
    select: (m) => ({ pollId: (m.state.variables as VotePollVariables)?.pollId, paused: m.state.isPaused }),
  });

  const vote = useCallback((variables: VotePollVariables): Promise<unknown> => {
    const offline = !onlineManager.isOnline();
    if (offline) toast.info("Vote saved. It'll send when you're back online.");
    const sent = queueMutation(queryClient, 'votePoll', variables);
    sent.then(() => toast.success("Vote recorded."), () => {});
    return sent;
  }, [queryClient]);

  return {
    vote,
    /** Being sent right now. */
    isBusyFor: (pollId: string) => pending.some((p) => p.pollId === pollId && !p.paused),
    /** Saved offline, sends when the connection is back. */
    isQueuedFor: (pollId: string) => pending.some((p) => p.pollId === pollId && p.paused),
  };
};
