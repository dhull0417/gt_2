import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi, Schedule } from "../utils/api";
import { Alert } from "react-native";

interface CreateGroupVariables {
  name: string;
  time: string;
  schedule: Schedule | null;
}

export const useCreateGroup = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: CreateGroupVariables) => 
      groupApi.createGroup(api, variables),
    
    onSuccess: (data) => {
      console.log("New Group Created:", data.group);
      Alert.alert("Success", data.message);
      
      // Invalidate the groups query to refresh the groups list
      queryClient.invalidateQueries({ queryKey: ['groups'] });

      // Also invalidate the events query to refresh the events list
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (error) => {
      console.error("Error creating group:", error);
      Alert.alert("Error", error.message || "Failed to create group.");
    },
  });
};