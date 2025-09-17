import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, eventApi } from "../utils/api";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

interface UpdateEventVariables {
  eventId: string;
  date: Date;
  time: string;
  timezone: string;
}

export const useUpdateEvent = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (variables: UpdateEventVariables) => 
      eventApi.updateEvent(api, variables),
    
    onSuccess: () => {
      Alert.alert("Success", "Event updated successfully!");
      // Invalidate the events query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['events'] });
      router.back(); // Go back to the event detail screen
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to update event.";
      Alert.alert("Error", errorMessage);
    },
  });
};