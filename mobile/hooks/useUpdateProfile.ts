import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, userApi } from "../utils/api";
import { getErrorMessage } from "../utils/networkError";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { openPendingInvite } from '@/utils/pendingInvite';
import { toast } from '@/contexts/ToastContext';

interface UpdateProfileVariables {
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  zipCode?: string;
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
      if (!(await openPendingInvite(router, 'replace'))) {
        toast.success("Profile updated.");
        router.replace('/(tabs)');
      }
    },
    onError: (error: any) => {
      Alert.alert("Error", getErrorMessage(error, "Failed to update profile."));
    },
  });
};