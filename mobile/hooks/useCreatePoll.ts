import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useApiClient, pollApi } from "../utils/api";
import { Alert } from "react-native";
import { broadcastPollUpdate } from "../utils/groupRealtime";

interface CreatePollVariables {
  groupId: string;
  prompt: string;
  options: string[];
  allowMultiple: boolean;
  expiresAt: string;
}

export const useCreatePoll = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: (variables: CreatePollVariables) => pollApi.createPoll(api, variables),

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['polls', variables.groupId] });
      broadcastPollUpdate(getToken, variables.groupId);
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to create poll.";
      Alert.alert("Error", errorMessage);
    },
  });
};
