import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, notificationApi } from "../utils/api";

export const useMarkNotificationsAsRead = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    // The mutation function takes no arguments
    mutationFn: () => 
      notificationApi.markNotificationsAsRead(api),
    
    onSuccess: () => {
      // Silently invalidate the notifications query.
      // This will cause useGetNotifications to refetch the data,
      // which will now have 'read: true' for all items.
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    
    onError: (error: any) => {
      // We don't need to show an alert, just log the error.
      const errorMessage = error.response?.data?.error || "Failed to mark notifications as read.";
      console.error("Error marking notifications as read:", errorMessage);
    },
  });
};