import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, notificationApi } from "../utils/api";
import { Alert } from "react-native";

export const useDeclineInvite = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => 
      notificationApi.declineInvite(api, notificationId),
    
    onSuccess: (data) => {
      Alert.alert("Declined", data.message);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to decline invite.";
      Alert.alert("Error", errorMessage);
    },
  });
};