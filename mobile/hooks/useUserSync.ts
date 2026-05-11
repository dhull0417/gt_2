import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useUser } from "@clerk/expo";
import { useApiClient, userApi } from "../utils/api";

export const useUserSync = () => {
  const { isSignedIn, isLoaded } = useAuth();
  const { user: clerkUser } = useUser();
  const api = useApiClient();
  const queryClient = useQueryClient();

  const syncUserMutation = useMutation({
    // Pass name from the Clerk client so the backend doesn't need to re-fetch
    // from Clerk's API, which can lag behind the client on first sign-in.
    mutationFn: () => userApi.syncUser(api, {
      firstName: clerkUser?.firstName ?? '',
      lastName: clerkUser?.lastName ?? '',
    }),
    onSuccess: (response: any) => {
      if (response.data?.user) {
        console.log("User sync successful for:", response.data.user._id);
      } else {
        console.log("User sync check complete:", response.data);
      }
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
    onError: (error) => console.error("User sync failed:", error),
  });

  useEffect(() => {
    // Wait for Clerk to fully resolve the new session before syncing.
    // Without isLoaded, getToken() can return null during the auth transition,
    // causing the server to receive an unauthenticated request.
    if (isLoaded && isSignedIn) {
      syncUserMutation.mutate();
    }
  }, [isLoaded, isSignedIn]);

  return syncUserMutation;
};
