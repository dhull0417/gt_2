import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi } from "../utils/api";
import { Alert } from "react-native";

interface LeaveGroupVariables {
  groupId: string;
}

export const useLeaveGroup = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: LeaveGroupVariables) =>
      groupApi.leaveGroup(api, variables.groupId),
    
    onSuccess: (data) => {
      Alert.alert("Success", data.message);
      // Refresh the main groups list, so the group disappears
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Could not leave group.";
      Alert.alert("Error", errorMessage);
    },
  });
};