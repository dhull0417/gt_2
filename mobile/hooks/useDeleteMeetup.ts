import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, meetupApi } from "../utils/api";
import { Alert } from "react-native";

interface DeleteMeetupVariables {
  meetupId: string;
}

export const useDeleteMeetup = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: DeleteMeetupVariables) => 
      meetupApi.deleteMeetup(api, variables.meetupId),
    
    onSuccess: (data) => {
      // The success message will be customized in the component
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to delete meetup.";
      Alert.alert("Error", errorMessage);
    },
  });
};