import { useMutation } from "@tanstack/react-query";
import { useApiClient, groupApi } from "../utils/api";
import { Alert } from "react-native";

interface InviteUserVariables {
  groupId: string;
  userIdToInvite: string;
}

export const useInviteUser = () => {
  const api = useApiClient();

  return useMutation({
    mutationFn: (variables: InviteUserVariables) => 
      groupApi.inviteUser(api, variables),
    
    onSuccess: (data) => {
      Alert.alert("Success", data.message);
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to send invitation.";
      Alert.alert("Error", errorMessage);
    },
  });
};