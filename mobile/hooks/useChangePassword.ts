import { useMutation } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-expo";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

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
      Alert.alert("Success", "Your password has been updated successfully.");
      router.back();
    },
    onError: (error: any) => {
      const errorMessage = error.errors?.[0]?.longMessage || "Failed to update password.";
      Alert.alert("Error", errorMessage);
    },
  });
};