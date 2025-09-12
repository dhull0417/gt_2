import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi } from "../utils/api";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

// Variables now only require a 'name'
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
      
      // --- THIS IS THE FIX ---
      // Expo Router's typed routes prefer an object for dynamic routes.
      // We explicitly provide the pathname and the parameters.
      router.push({
        pathname: "/group-setup/[id]",
        params: { id: newGroupId },
      });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to create group.";
      Alert.alert("Error", errorMessage);
    },
  });
};