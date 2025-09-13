import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { useApiClient, userApi } from "../utils/api";

export const useUserSync = () => {
  const { isSignedIn } = useAuth();
  const api = useApiClient();

  const syncUserMutation = useMutation({
    mutationFn: () => userApi.syncUser(api),
    onSuccess: (response: any) => {
      if (response.data?.user) {
        console.log("User sync successful for:", response.data.user._id);
      } else {
        console.log("User sync check complete:", response.data);
      }
    },
    onError: (error) => console.error("User sync failed:", error),
  });

  useEffect(() => {
    // This effect will attempt to sync the user as soon as they are signed in.
    if (isSignedIn) {
      syncUserMutation.mutate();
    }
  }, [isSignedIn]);

  // Return the entire mutation object so the caller can check its status (isSuccess, isPending, etc.)
  return syncUserMutation;
};