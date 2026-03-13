import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi } from "../utils/api";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

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

  return useMutation({
    mutationFn: (variables: CreateOneOffMeetupVariables) => 
      groupApi.createOneOffMeetup(api, variables),
    
    onSuccess: () => {
      Alert.alert("Success", "One-off meetup has been scheduled!");
      // Invalidate the meetups query to refresh the meetups list
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
      router.back(); // Go back to the group detail screen
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to schedule meetup.";
      Alert.alert("Error", errorMessage);
    },
  });
};