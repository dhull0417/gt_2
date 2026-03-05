import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi } from "../utils/api";
import { Alert } from "react-native";

interface InviteUserVariables {
  groupId: string;
  userIdToInvite: string;
}

export const useInviteUser = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: InviteUserVariables) =>
      groupApi.inviteUser(api, variables),
    
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to send invite.";
      Alert.alert("Error", errorMessage);
    },
  });
};