import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, meetupApi } from "../utils/api";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

interface UpdateMeetupVariables {
  meetupId: string;
  date?: Date;
  time?: string;
}

export const useUpdateMeetup = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (variables: UpdateMeetupVariables) => 
      meetupApi.updateMeetup(api, variables),
    
    onSuccess: () => {
      Alert.alert("Success", "Meetup updated successfully!");
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
      router.back();
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to update meetup.";
      Alert.alert("Error", errorMessage);
    },
  });
};