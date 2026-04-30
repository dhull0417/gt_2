import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, userApi } from "../utils/api";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from 'expo-secure-store';
import { PENDING_INVITE_KEY } from '@/app/join/[token]';

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
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      const pendingToken = await SecureStore.getItemAsync(PENDING_INVITE_KEY);
      if (pendingToken) {
        await SecureStore.deleteItemAsync(PENDING_INVITE_KEY);
        router.replace({ pathname: '/join/[token]', params: { token: pendingToken } });
      } else {
        Alert.alert("Success", "Your profile has been updated.");
        router.replace('/(tabs)');
      }
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to update profile.";
      Alert.alert("Error", errorMessage);
    },
  });
};