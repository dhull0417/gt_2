import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, userApi } from "../utils/api";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

interface UpdateProfileVariables {
  firstName: string;
  lastName: string;
}

export const useUpdateProfile = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (variables: UpdateProfileVariables) =>
      userApi.updateProfile(api, variables),
    
    // --- THIS IS THE FIX ---
    // Make the onSuccess function async to allow for 'await'
    onSuccess: async () => {
      Alert.alert("Success", "Your profile has been updated.");

      // Await the invalidation. This pauses execution until the 'currentUser'
      // query has finished refetching its new data.
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      
      // Now that we know the user data is fresh, it's safe to navigate.
      router.replace('/(tabs)');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to update profile.";
      Alert.alert("Error", errorMessage);
    },
  });
};