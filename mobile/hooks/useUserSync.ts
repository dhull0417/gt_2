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
    // Pass name from Clerk client directly — Clerk's API can lag on first sign-in.
    mutationFn: () => userApi.syncUser(api, {
      firstName: clerkUser?.firstName ?? '',
      lastName: clerkUser?.lastName ?? '',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
    onError: (error) => console.error("User sync failed:", error),
  });

  useEffect(() => {
    // Wait for isLoaded — otherwise getToken() can return null mid-transition.
    if (isLoaded && isSignedIn) {
      syncUserMutation.mutate();
    }
  }, [isLoaded, isSignedIn]);

  return syncUserMutation;
};
