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
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
      router.back();
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to schedule meetup.";
      Alert.alert("Error", errorMessage);
    },
  });
};