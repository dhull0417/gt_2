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
      // Invalidate the meetups query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
      router.back(); // Go back to the meetup detail screen
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to update meetup.";
      Alert.alert("Error", errorMessage);
    },
  });
};