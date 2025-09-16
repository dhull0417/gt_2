import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-expo";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

interface UpdateUsernameVariables {
  username: string;
}

export const useUpdateUsername = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (variables: UpdateUsernameVariables) => {
        if (!user) throw new Error("User not found");
        return user.update(variables);
    },
    onSuccess: () => {
      Alert.alert("Success", "Your username has been updated.");
      // Invalidate the currentUser query to ensure the whole app gets the fresh data
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      // Go back to the previous screen (the account menu)
      router.back();
    },
    onError: (error: any) => {
      const errorMessage = error.errors?.[0]?.longMessage || "Failed to update username.";
      Alert.alert("Error", errorMessage);
    },
  });
};