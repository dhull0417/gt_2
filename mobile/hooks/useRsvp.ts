import { useCallback, useMemo } from "react";
import { onlineManager, useMutationState, useQueryClient } from "@tanstack/react-query";
import { useApiClient, Meetup } from "../utils/api";
import { haptic } from "../utils/haptics";
import { emitRsvpResponse } from "../utils/rsvpResponseBus";
import { promptForNotificationPermissionOnFirstRsvpIn } from "./usePushNotifications";
import { RSVP_MUTATION_KEY, type RsvpVariables } from "../utils/offlineMutations";
import { queueMutation } from "../utils/queuedMutations";
import { toast } from "@/contexts/ToastContext";

// Meetups we've already said "saved, sends when online" about during this offline stretch,
// so tapping In/Out/In doesn't stack three toasts.
const toldOffline = new Set<string>();
onlineManager.subscribe((online) => { if (online) toldOffline.clear(); });

interface RsvpCallbacks {
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
}

// The mutationFn, the optimistic card flip and the error toast all live on the QueryClient
// (utils/offlineMutations.ts, app/_layout.tsx), so a queued RSVP resolves correctly even when no
// screen is mounted. What's here is UI-only: the reaction popup, the haptic, and per-meetup state.
export const useRsvp = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  const states = useMutationState({
    filters: { mutationKey: RSVP_MUTATION_KEY, status: 'pending' },
    select: (m) => ({ vars: m.state.variables as RsvpVariables, paused: m.state.isPaused }),
  });

  // Sending right now (show a spinner) vs. waiting for a connection (leave the buttons usable:
  // the card already shows the new answer, and tapping again just replaces the queued one).
  const busyIds = useMemo(() => new Set(states.filter((s) => !s.paused).map((s) => s.vars?.meetupId)), [states]);
  const queuedIds = useMemo(() => new Set(states.filter((s) => s.paused).map((s) => s.vars?.meetupId)), [states]);

  const mutate = useCallback((variables: RsvpVariables, callbacks?: RsvpCallbacks) => {
    if (!onlineManager.isOnline() && !variables.targetUserId && !toldOffline.has(variables.meetupId)) {
      toldOffline.add(variables.meetupId);
      toast.info("Saved. It'll send when you're back online.");
    }
    queueMutation<{ meetup?: Meetup }>(queryClient, 'rsvp', variables).then(
      (data) => {
        haptic.success();
        if (!variables.skipResponsePopup) {
          // The group's own reactions (Premium) replace the defaults for that status.
          const meetup = queryClient.getQueryData<Meetup[]>(['meetups'])?.find((m) => m._id === variables.meetupId);
          const custom = meetup?.group?.isPremium === false
            ? undefined
            : meetup?.group?.rsvpResponses?.filter((r) => r.status === variables.status);
          emitRsvpResponse(variables.status, custom);
        }
        if (variables.status === 'in') promptForNotificationPermissionOnFirstRsvpIn(api);
        callbacks?.onSuccess?.(data);
      },
      // The message itself is shown once, globally (MutationCache.onError in app/_layout.tsx).
      (error) => callbacks?.onError?.(error),
    );
  }, [api, queryClient]);

  return {
    mutate,
    /** A request for this meetup is on its way right now. */
    isBusyFor: (meetupId: string) => busyIds.has(meetupId),
    /** An RSVP for this meetup is saved and waiting for a connection. */
    isQueuedFor: (meetupId: string) => queuedIds.has(meetupId),
  };
};
