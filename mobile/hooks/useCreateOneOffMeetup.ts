import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useApiClient, groupApi } from "../utils/api";
import { getErrorMessage } from "../utils/networkError";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { broadcastMeetupUpdate } from "../utils/groupRealtime";
import { toast } from '@/contexts/ToastContext';

interface CreateOneOffMeetupVariables {
  groupId: string;
  date: Date;
  time: string;
  timezone: string;
}

export const useCreateOneOffMeetup = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: (variables: CreateOneOffMeetupVariables) =>
      groupApi.createOneOffMeetup(api, variables),

    onSuccess: (_data, variables) => {
      toast.success("Meetup scheduled!");
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
      broadcastMeetupUpdate(getToken, variables.groupId);
      router.back();
    },
    onError: (error: any) => {
      Alert.alert("Error", getErrorMessage(error, "Failed to schedule meetup."));
    },
  });
};