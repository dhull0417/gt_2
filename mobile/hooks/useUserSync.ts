import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useUser } from "@clerk/expo";
import { useApiClient, userApi } from "../utils/api";
import { peekPendingAppleName, pendingNameFor, clearPendingAppleName } from "../utils/pendingAppleName";

export const useUserSync = () => {
  const { isSignedIn, isLoaded } = useAuth();
  const { user: clerkUser } = useUser();
  const api = useApiClient();
  const queryClient = useQueryClient();

  const syncUserMutation = useMutation({
    // Pass name from Clerk client directly — Clerk's API can lag on first sign-in.
    // A name Apple handed over that never reached the server (see useAppleAuth) wins,
    // but only for the Apple account it came from.
    mutationFn: async () => {
      const appleIds = (clerkUser?.externalAccounts ?? [])
        .filter((a) => String(a.provider).includes('apple'))
        .map((a) => a.providerUserId);
      const pending = pendingNameFor(await peekPendingAppleName(), appleIds);
      const res = await userApi.syncUser(api, pending ?? {
        firstName: clerkUser?.firstName ?? '',
        lastName: clerkUser?.lastName ?? '',
      });
      if (pending) await clearPendingAppleName();
      return res;
    },
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
