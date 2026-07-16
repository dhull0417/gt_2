import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, pollApi } from "../utils/api";
import { Alert } from "react-native";

interface VotePollVariables {
  pollId: string;
  optionIds: string[];
  groupId: string;
}

export const useVotePoll = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pollId, optionIds }: VotePollVariables) =>
      pollApi.votePoll(api, { pollId, optionIds }),

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['polls', variables.groupId] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to submit vote.";
      Alert.alert("Error", errorMessage);
    },
  });
};
