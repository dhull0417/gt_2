import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi, Schedule } from "../utils/api";
import { Alert } from "react-native";

interface RemoveScheduledDayVariables {
  groupId: string;
  day: number;
  frequency: 'weekly' | 'monthly';
}

export const useRemoveScheduledDay = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: RemoveScheduledDayVariables) => 
      groupApi.removeScheduledDay(api, variables),
    
    onSuccess: (data) => {
      Alert.alert("Success", "The recurring day has been removed from the schedule.");
      // Invalidate everything to ensure UI consistency
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['groupDetails'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to update schedule.";
      Alert.alert("Error", errorMessage);
    },
  });
};