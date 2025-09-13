import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi } from "../utils/api";
import { Alert } from "react-native";

interface RemoveMemberVariables {
  groupId: string;
  memberIdToRemove: string;
}

export const useRemoveMember = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: RemoveMemberVariables) =>
      groupApi.removeMember(api, variables),
    
    onSuccess: (data) => {
      Alert.alert("Success", data.message);
      // Invalidate the specific group's details to refresh the member list
      // This will be handled in the component for access to the groupId
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Could not remove member.";
      Alert.alert("Error", errorMessage);
    },
  });
};