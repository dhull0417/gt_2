import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { useApiClient, groupApi } from "../utils/api";
import { Alert } from "react-native";

interface CreateGroupVariables {
  name: string;
}

export const useCreateGroup = () => {
  const navigation = useNavigation();
  const api = useApiClient();
  const queryClient = useQueryClient();

  const createGroupMutation = useMutation({
    mutationFn: async (variables: CreateGroupVariables) => {
      if (!variables.name) {
        throw new Error("Group name cannot be empty.");
      }
      // This line has been updated to pass the group name directly as a string,
      // which is the simplest fix to resolve the TypeScript error.
      return await groupApi.createGroup(api, variables.name);
    },
    onSuccess: (response) => {
      console.log("New Group Created:", response.data);
      Alert.alert("Success", "Group created successfully!");
      // Invalidate relevant queries to re-fetch the group list
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      // Navigate back or close the modal
      navigation.goBack();
    },
    onError: (error) => {
      console.error("Error creating group:", error);
      Alert.alert("Error", error.message || "Failed to create group.");
    },
  });

  return createGroupMutation;
};
