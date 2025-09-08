import { useMutation, useQueryClient } from "@tanstack/react-query";
// REMOVED: useNavigation is no longer needed here
import { useApiClient, groupApi, Schedule } from "../utils/api";
import { Alert } from "react-native";

interface CreateGroupVariables {
  name: string;
  time: string;
  schedule: Schedule | null;
}

export const useCreateGroup = () => {
  // REMOVED: The navigation constant is gone
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: CreateGroupVariables) => 
      groupApi.createGroup(api, variables),
    
    // MODIFIED: The onSuccess logic is now simpler
    onSuccess: (data) => {
      console.log("New Group Created:", data.group);
      Alert.alert("Success", data.message);
      // This part is still crucial for updating the group list
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      // REMOVED: navigation.goBack() has been removed
    },
    onError: (error) => {
      console.error("Error creating group:", error);
      Alert.alert("Error", error.message || "Failed to create group.");
    },
  });
};
