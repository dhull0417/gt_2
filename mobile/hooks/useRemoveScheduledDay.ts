import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useApiClient, groupApi, Schedule } from "../utils/api";
import { Alert } from "react-native";
import { broadcastGroupUpdate, broadcastMeetupUpdate } from "../utils/groupRealtime";

interface RemoveScheduledDayVariables {
  groupId: string;
  day: number;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
}

export const useRemoveScheduledDay = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: (variables: RemoveScheduledDayVariables) =>
      groupApi.removeScheduledDay(api, variables),

    onSuccess: (data, variables) => {
      Alert.alert("Success", "The recurring day has been removed from the schedule.");
      // Invalidate everything to ensure UI consistency
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
      queryClient.invalidateQueries({ queryKey: ['groupDetails', variables.groupId] });
      broadcastGroupUpdate(getToken, variables.groupId);
      broadcastMeetupUpdate(getToken, variables.groupId);
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to update schedule.";
      Alert.alert("Error", errorMessage);
    },
  });
};