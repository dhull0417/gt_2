import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, eventApi } from "../utils/api";
import { Alert } from "react-native";

interface DeleteEventVariables {
  eventId: string;
}

export const useDeleteEvent = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: DeleteEventVariables) => 
      eventApi.deleteEvent(api, variables.eventId),
    
    onSuccess: (data) => {
      Alert.alert("Success", data.message);
      // Invalidate the events query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to delete event.";
      Alert.alert("Error", errorMessage);
    },
  });
};