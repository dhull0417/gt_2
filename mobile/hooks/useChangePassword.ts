import { useMutation } from "@tanstack/react-query";
import { useUser } from "@clerk/expo";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { toast } from '@/contexts/ToastContext';

interface ChangePasswordVariables {
  currentPassword: string;
  newPassword: string;
}

export const useChangePassword = () => {
  const { user } = useUser();
  const router = useRouter();

  return useMutation({
    mutationFn: async (variables: ChangePasswordVariables) => {
        if (!user) throw new Error("User not found");
        return user.updatePassword(variables);
    },
    onSuccess: () => {
      toast.success("Password updated.");
      router.back();
    },
    onError: (error: any) => {
      const errorMessage = error.errors?.[0]?.longMessage || "Failed to update password.";
      Alert.alert("Error", errorMessage);
    },
  });
};
