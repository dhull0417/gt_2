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
    
    onSuccess: () => {
      // Invalidate the currentUser query to ensure the whole app gets the fresh data
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      // Redirect the user to the main app now that their profile is complete
      router.replace('/(tabs)');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to update profile.";
      Alert.alert("Error", errorMessage);
    },
  });
};
