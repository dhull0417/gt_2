import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi } from "../utils/api";
import { Alert } from "react-native";

interface DeleteGroupVariables {
  groupId: string;
}

export const useDeleteGroup = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: DeleteGroupVariables) =>
      groupApi.deleteGroup(api, variables.groupId),
    
    onSuccess: (data) => {
      Alert.alert("Success", data.message);
      // Invalidate the main 'groups' query to refresh the list on the main screen
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      
      // --- THIS IS THE FIX ---
      // Also invalidate the 'meetups' query to refresh the meetups list
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to delete group.";
      Alert.alert("Error", errorMessage);
    },
  });
};