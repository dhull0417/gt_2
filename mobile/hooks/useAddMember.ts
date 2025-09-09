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
    
    onSuccess: (data) => {
      Alert.alert("Success", data.message);
      // We don't need to invalidate the main 'groups' list here,
      // but we will invalidate the specific group's details to refresh the member list.
      // This will be handled in the component.
    },
    onError: (data, error: any) => {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || "Failed to add user.";
      console.error("Error adding member:", error.response?.data || error.message);
      console.error(data);
      Alert.alert("Error", errorMessage);
    },
  });
};