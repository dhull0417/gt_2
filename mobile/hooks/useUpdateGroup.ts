import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi, Schedule } from "../utils/api";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

interface UpdateGroupVariables {
  groupId: string;
  time: string;
  schedule: Schedule;
  timezone: string;
}

export const useUpdateGroup = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (variables: UpdateGroupVariables) => 
      groupApi.updateGroup(api, variables),
    
    onSuccess: async (data) => {
      Alert.alert("Success", "Group updated successfully!");
      
      await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['groups'] }),
          queryClient.invalidateQueries({ queryKey: ['events'] }),
          queryClient.invalidateQueries({ queryKey: ['groupDetails', data.group._id] })
      ]);

      router.back();
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to update group.";
      Alert.alert("Error", errorMessage);
    },
  });
};