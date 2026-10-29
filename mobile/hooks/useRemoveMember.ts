import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useApiClient, groupApi } from "../utils/api";
import { broadcastGroupUpdate } from "../utils/groupRealtime";
import { Alert } from "react-native";
import { toast } from '@/contexts/ToastContext';

interface RemoveMemberVariables {
  groupId: string;
  memberIdToRemove: string;
}

export const useRemoveMember = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: (variables: RemoveMemberVariables) =>
      groupApi.removeMember(api, variables),

    onSuccess: (data, variables) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ['groupDetails', variables.groupId] });
      broadcastGroupUpdate(getToken, variables.groupId);
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Could not remove member.";
      Alert.alert("Error", errorMessage);
    },
  });
};