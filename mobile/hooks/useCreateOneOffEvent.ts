import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi } from "../utils/api";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

interface CreateOneOffEventVariables {
  groupId: string;
  date: Date;
  time: string;
  timezone: string;
}

export const useCreateOneOffEvent = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (variables: CreateOneOffEventVariables) => 
      groupApi.createOneOffEvent(api, variables),
    
    onSuccess: () => {
      Alert.alert("Success", "One-off event has been scheduled!");
      // Invalidate the events query to refresh the events list
      queryClient.invalidateQueries({ queryKey: ['events'] });
      router.back(); // Go back to the group detail screen
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to schedule event.";
      Alert.alert("Error", errorMessage);
    },
  });
};