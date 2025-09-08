import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
// Import the Schedule type from your api utility file
import { useApiClient, groupApi, Schedule } from "../utils/api";
import { Alert } from "react-native";

interface CreateGroupVariables {
  name: string;
  time: string;
  schedule: Schedule | null; // Add the optional schedule property
}

export const useCreateGroup = () => {
  const navigation = useNavigation();
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    // The mutation function now passes the entire variables object
    mutationFn: (variables: CreateGroupVariables) => 
      groupApi.createGroup(api, variables),
    
    onSuccess: (data) => {
      console.log("New Group Created:", data.group);
      Alert.alert("Success", data.message);
      // Re-fetch the groups list to show the new group
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      navigation.goBack(); 
    },
    onError: (error) => {
      console.error("Error creating group:", error);
      Alert.alert("Error", error.message || "Failed to create group.");
    },
  });
};
