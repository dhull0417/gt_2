import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useApiClient, pollApi } from "../utils/api";
import { Alert } from "react-native";
import { broadcastPollUpdate } from "../utils/groupRealtime";
import { toast } from '@/contexts/ToastContext';

interface VotePollVariables {
  pollId: string;
  optionIds: string[];
  groupId: string;
}

export const useVotePoll = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: ({ pollId, optionIds }: VotePollVariables) =>
      pollApi.votePoll(api, { pollId, optionIds }),

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['polls', variables.groupId] });
      broadcastPollUpdate(getToken, variables.groupId);
      toast.success("Vote recorded.");
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to submit vote.";
      Alert.alert("Error", errorMessage);
    },
  });
};
