import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useApiClient, groupApi } from "../utils/api";
import { Alert } from "react-native";
import { broadcastGroupUpdate, broadcastMeetupUpdate } from "../utils/groupRealtime";

interface DeleteGroupVariables {
  groupId: string;
}

export const useDeleteGroup = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: (variables: DeleteGroupVariables) =>
      groupApi.deleteGroup(api, variables.groupId),

    onSuccess: (data, variables) => {
      Alert.alert("Success", data.message);
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
      // Fire before the group's gone server-side would be pointless, but by
      // now the delete already succeeded — other members' devices just need
      // the ping so they drop it without waiting on staleTime.
      broadcastGroupUpdate(getToken, variables.groupId);
      broadcastMeetupUpdate(getToken, variables.groupId);
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to delete group.";
      Alert.alert("Error", errorMessage);
    },
  });
};