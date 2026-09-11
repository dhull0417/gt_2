import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "../utils/api";
import { Alert } from "react-native";
import { emitRsvpResponse } from "../utils/rsvpResponseBus";
import { promptForNotificationPermissionOnFirstRsvpIn } from "./usePushNotifications";
import { RSVP_MUTATION_KEY, type RsvpVariables } from "../utils/offlineMutations";
import { useIsOnline } from "./useIsOnline";

// The mutationFn lives in utils/offlineMutations.ts (registered on the
// QueryClient), not here — see the comment there. The ['meetups'] cache
// invalidation on success also runs globally (app/_layout.tsx's MutationCache),
// so it still happens even if this screen isn't mounted when a queued RSVP
// finally goes through. What's left here is UI-only and fine to skip if that's
// the case: the popup/notification-prompt has nothing to attach to.
export const useRsvp = () => {
  const api = useApiClient();
  const isOnline = useIsOnline();

  const mutation = useMutation<unknown, any, RsvpVariables>({
    mutationKey: RSVP_MUTATION_KEY,

    onSuccess: (_data, variables) => {
      if (!variables.skipResponsePopup) emitRsvpResponse(variables.status);
      if (variables.status === 'in') promptForNotificationPermissionOnFirstRsvpIn(api);
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || "Failed to update RSVP.";
      Alert.alert("Error", errorMessage);
    },
  });

  return {
    ...mutation,
    // Tapping while offline still queues the RSVP (it's applied once
    // reconnected, same as before) - this just surfaces feedback so the tap
    // doesn't look like a no-op, since the only other visible change offline
    // was the button's own disabled-opacity styling.
    mutate: (variables: RsvpVariables, options?: Parameters<typeof mutation.mutate>[1]) => {
      if (!isOnline) Alert.alert("You're offline", "Connect to internet to RSVP.");
      mutation.mutate(variables, options);
    },
  };
};
