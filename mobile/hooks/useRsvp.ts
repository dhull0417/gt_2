import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, meetupApi } from "../utils/api";
import { Alert } from "react-native";
import { emitRsvpResponse } from "../utils/rsvpResponseBus";
import { promptForNotificationPermissionOnFirstRsvpIn } from "./usePushNotifications";

interface RsvpVariables {
  meetupId: string;
  status: 'in' | 'out';
  skipResponsePopup?: boolean;
}

export const useRsvp = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: RsvpVariables) =>
      meetupApi.handleRsvp(api, variables),

    onSuccess: (data, variables) => {
      if (!variables.skipResponsePopup) emitRsvpResponse(variables.status);
      if (variables.status === 'in') promptForNotificationPermissionOnFirstRsvpIn(api);
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || "Failed to update RSVP.";
      Alert.alert("Error", errorMessage);
    },
  });
};