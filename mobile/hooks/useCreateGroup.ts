import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi } from "../utils/api";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

interface CreateGroupVariables {
  name: string;
}

export const useCreateGroup = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (variables: CreateGroupVariables) => 
      groupApi.createGroup(api, variables),
    
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      const newGroupId = data.group._id;
      router.push(`/group-setup/${newGroupId}`);
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to create group.";
      Alert.alert("Error", errorMessage);
    },
  });
};