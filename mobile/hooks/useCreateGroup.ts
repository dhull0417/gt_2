import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi, Schedule } from "../utils/api";
import { Alert } from "react-native";

interface CreateGroupVariables {
  name: string;
  time: string;
  schedule: Schedule;
  timezone: string;
}

export const useCreateGroup = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: CreateGroupVariables) => 
      groupApi.createGroup(api, variables),
    
    onSuccess: (data) => {
      Alert.alert("Success", "Group created successfully!");
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to create group.";
      Alert.alert("Error", errorMessage);
    },
  });
};