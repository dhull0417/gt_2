import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useApiClient, groupApi } from "../utils/api";
import { broadcastGroupUpdate } from "../utils/groupRealtime";
import { Alert } from "react-native";

interface LeaveGroupVariables {
  groupId: string;
}

export const useLeaveGroup = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: (variables: LeaveGroupVariables) =>
      groupApi.leaveGroup(api, variables.groupId),

    onSuccess: (data, variables) => {
      Alert.alert("Success", data.message);
      // Refresh the main groups list, so the group disappears
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
      broadcastGroupUpdate(getToken, variables.groupId);
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Could not leave group.";
      Alert.alert("Error", errorMessage);
    },
  });
};