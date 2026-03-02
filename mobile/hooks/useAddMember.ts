import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi } from "../utils/api";
import { Alert } from "react-native";

interface AddMemberVariables {
  groupId: string;
  userId: string;
}

export const useAddMember = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: AddMemberVariables) =>
      groupApi.addMember(api, variables),
    
    onSuccess: (data, variables) => {
      Alert.alert("Success", data.message);
      queryClient.invalidateQueries({ queryKey: ['groupDetails', variables.groupId] });
    },
    onError: (data, error: any) => {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || "Failed to add user.";
      console.error("Error adding member:", error.response?.data || error.message);
      console.error(data);
      Alert.alert("Error", errorMessage);
    },
  });
};