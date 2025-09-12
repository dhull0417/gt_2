import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi, UpdateGroupDetailsPayload } from "../utils/api";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

export const useUpdateGroupDetails = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (variables: UpdateGroupDetailsPayload) =>
      groupApi.updateGroupDetails(api, variables),
    
    onSuccess: (data) => {
      Alert.alert("Success", "Group setup complete!");
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['groupDetails', data.group._id] });
      router.replace('/(tabs)/groups');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to update group details.";
      Alert.alert("Error", errorMessage);
    },
  });
};