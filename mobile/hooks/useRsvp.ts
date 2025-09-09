import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, eventApi } from "../utils/api";
import { Alert } from "react-native";

interface RsvpVariables {
  eventId: string;
  status: 'in' | 'out';
}

export const useRsvp = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: RsvpVariables) =>
      eventApi.handleRsvp(api, variables),
    
    onSuccess: (data) => {
      Alert.alert("Success", "Your RSVP has been recorded.");
      // Invalidate the main events query to refresh all data
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || "Failed to update RSVP.";
      Alert.alert("Error", errorMessage);
    },
  });
};