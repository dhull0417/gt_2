import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "../utils/api";
import { Alert } from "react-native";
import { emitRsvpResponse } from "../utils/rsvpResponseBus";
import { promptForNotificationPermissionOnFirstRsvpIn } from "./usePushNotifications";
import { RSVP_MUTATION_KEY, type RsvpVariables } from "../utils/offlineMutations";

// The mutationFn lives in utils/offlineMutations.ts (registered on the
// QueryClient), not here — see the comment there. The ['meetups'] cache
// invalidation on success also runs globally (app/_layout.tsx's MutationCache),
// so it still happens even if this screen isn't mounted when a queued RSVP
// finally goes through. What's left here is UI-only and fine to skip if that's
// the case: the popup/notification-prompt has nothing to attach to.
export const useRsvp = () => {
  const api = useApiClient();

  return useMutation<unknown, any, RsvpVariables>({
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
};
