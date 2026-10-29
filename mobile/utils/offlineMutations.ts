import type { QueryClient } from '@tanstack/react-query';
import { meetupApi, notificationApi, type Meetup, type User } from '@/utils/api';
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

const idOf = (u: User | string) => (typeof u === 'string' ? u : u._id);

/** How many seats are taken: everyone who's In plus their guests. */
const headcount = (m: Meetup) => m.in.length + (m.guests ?? []).reduce((n, g) => n + (g.count || 0), 0);

/**
 * What the meetup will look like once my RSVP lands, so the card flips instantly.
 * Returns null when the outcome depends on the server (a full meetup: waitlist or
 * priority bumps) - the UI then just waits for the real answer.
 */
export function applyOptimisticRsvp(m: Meetup, me: string, status: 'in' | 'out'): Meetup | null {
  const without = (list: (User | string)[]) => list.filter((u) => idOf(u) !== me);
  const alreadyIn = m.in.some((u) => idOf(u) === me);
  if (status === 'in') {
    const full = m.capacity > 0 && !alreadyIn && headcount(m) >= m.capacity;
    if (full) return null;
    return {
      ...m,
      in: alreadyIn ? m.in : [...m.in, me],
      out: without(m.out),
      waitlist: without(m.waitlist),
      undecided: m.undecided.filter((id) => id !== me),
    };
  }
  return {
    ...m,
    in: without(m.in),
    out: m.out.some((u) => idOf(u) === me) ? m.out : [...m.out, me],
    waitlist: without(m.waitlist),
    undecided: m.undecided.filter((id) => id !== me),
  };
}

export function registerOfflineMutationDefaults(queryClient: QueryClient) {
  queryClient.setMutationDefaults(RSVP_MUTATION_KEY, {
    mutationFn: (variables: RsvpVariables) => meetupApi.handleRsvp(authedApi, variables),
    // Optimistic: flip the card immediately, roll just that meetup back if the server says no.
    onMutate: async (variables: RsvpVariables): Promise<{ previous?: Meetup }> => {
      if (variables.targetUserId) return {}; // admin overrides wait for the server
      await queryClient.cancelQueries({ queryKey: ['meetups'] });
      const me = queryClient.getQueryData<User>(['currentUser'])?._id;
      const list = queryClient.getQueryData<Meetup[]>(['meetups']);
      const previous = list?.find((m) => m._id === variables.meetupId);
      if (!me || !list || !previous) return {};
      const next = applyOptimisticRsvp(previous, me, variables.status);
      if (!next) return {};
      queryClient.setQueryData<Meetup[]>(['meetups'], list.map((m) => (m._id === previous._id ? next : m)));
      return { previous };
    },
    onError: (_error: unknown, _variables: RsvpVariables, context: { previous?: Meetup } | undefined) => {
      const previous = context?.previous;
      if (!previous) return;
      queryClient.setQueryData<Meetup[]>(['meetups'], (list) => list?.map((m) => (m._id === previous._id ? previous : m)));
    },
  });
  queryClient.setMutationDefaults(ACCEPT_INVITE_MUTATION_KEY, {
    mutationFn: (notificationId: string) => notificationApi.acceptInvite(authedApi, notificationId),
  });
  queryClient.setMutationDefaults(DECLINE_INVITE_MUTATION_KEY, {
    mutationFn: (notificationId: string) => notificationApi.declineInvite(authedApi, notificationId),
  });
}
