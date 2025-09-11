import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi, Schedule } from "../utils/api";
import { Alert } from "react-native";

interface CreateGroupVariables {
  name: string;
  time: string;
  schedule: Schedule | null;
  timezone: string; // Add the required timezone property
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
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (error) => {
      console.error("Error creating group:", error);
      Alert.alert("Error", error.message || "Failed to create group.");
    },
  });
};