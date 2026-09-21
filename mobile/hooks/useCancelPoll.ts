import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useApiClient, pollApi } from "../utils/api";
import { Alert } from "react-native";
import { broadcastPollUpdate } from "../utils/groupRealtime";

interface CancelPollVariables {
  pollId: string;
  groupId: string;
}

export const useCancelPoll = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: ({ pollId }: CancelPollVariables) => pollApi.cancelPoll(api, pollId),

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['polls', variables.groupId] });
      broadcastPollUpdate(getToken, variables.groupId);
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to cancel poll.";
      Alert.alert("Error", errorMessage);
    },
  });
};
