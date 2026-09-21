import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useApiClient, meetupApi } from "../utils/api";
import { getErrorMessage } from "../utils/networkError";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { broadcastMeetupUpdate } from "../utils/groupRealtime";

interface UpdateMeetupVariables {
  meetupId: string;
  date?: Date;
  time?: string;
}

export const useUpdateMeetup = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: (variables: UpdateMeetupVariables) =>
      meetupApi.updateMeetup(api, variables),

    onSuccess: (data) => {
      Alert.alert("Success", "Meetup updated successfully!");
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
      const groupId = data.meetup ? (typeof data.meetup.group === 'string' ? data.meetup.group : data.meetup.group._id) : undefined;
      if (groupId) broadcastMeetupUpdate(getToken, groupId);
      router.back();
    },
    onError: (error: any) => {
      Alert.alert("Error", getErrorMessage(error, "Failed to update meetup."));
    },
  });
};