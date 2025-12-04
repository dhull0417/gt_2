import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, userApi } from "../utils/api";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

// Include username in the variables
interface UpdateProfileVariables {
  username?: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
}

export const useUpdateProfile = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (variables: UpdateProfileVariables) =>
      userApi.updateProfile(api, variables),
    
    onSuccess: async () => {
      Alert.alert("Success", "Your profile has been updated.");
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      router.replace('/(tabs)');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to update profile.";
      Alert.alert("Error", errorMessage);
    },
  });
};