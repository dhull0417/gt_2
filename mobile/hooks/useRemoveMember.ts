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
    
    onSuccess: (data, variables) => {
      Alert.alert("Success", data.message);
      queryClient.invalidateQueries({ queryKey: ['groupDetails', variables.groupId] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Could not remove member.";
      Alert.alert("Error", errorMessage);
    },
  });
};