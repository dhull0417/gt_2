import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, notificationApi } from "../utils/api";
import { Alert } from "react-native";

export const useAcceptInvite = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => 
      notificationApi.acceptInvite(api, notificationId),
    
    onSuccess: (data) => {
      Alert.alert("Success", data.message);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to accept invite.";
      Alert.alert("Error", errorMessage);
    },
  });
};