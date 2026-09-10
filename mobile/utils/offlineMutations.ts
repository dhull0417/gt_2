import type { QueryClient } from '@tanstack/react-query';
import { meetupApi, notificationApi } from '@/utils/api';
import { authedApi } from '@/utils/authedApi';

// Same pattern as chatMutations.ts: the mutationFn is registered here, keyed
// by mutationKey, rather than passed to each useMutation call — so an RSVP or
// invite response queued while offline can still be resumed (by _layout.tsx's
// resumePausedMutations) after an app restart, before any screen remounts.

export const RSVP_MUTATION_KEY = ['rsvp'] as const;
export const ACCEPT_INVITE_MUTATION_KEY = ['acceptInvite'] as const;
export const DECLINE_INVITE_MUTATION_KEY = ['declineInvite'] as const;

export interface RsvpVariables {
  meetupId: string;
  status: 'in' | 'out';
  skipResponsePopup?: boolean;
  targetUserId?: string;
}

export function registerOfflineMutationDefaults(queryClient: QueryClient) {
  queryClient.setMutationDefaults(RSVP_MUTATION_KEY, {
    mutationFn: (variables: RsvpVariables) => meetupApi.handleRsvp(authedApi, variables),
  });
  queryClient.setMutationDefaults(ACCEPT_INVITE_MUTATION_KEY, {
    mutationFn: (notificationId: string) => notificationApi.acceptInvite(authedApi, notificationId),
  });
  queryClient.setMutationDefaults(DECLINE_INVITE_MUTATION_KEY, {
    mutationFn: (notificationId: string) => notificationApi.declineInvite(authedApi, notificationId),
  });
}
