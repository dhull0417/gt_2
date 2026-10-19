import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, useUser } from '@clerk/expo';
import { useApiClient, userApi } from '../utils/api';
import { getPackages, initPurchases, purchase, purchasesAvailable, resetPurchases, restore } from '../utils/purchases';

/** Mount once at the app root: keeps RevenueCat logged in as the current Clerk user. */
export const usePurchasesSetup = () => {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const clerkId = user?.id;

  useEffect(() => {
    if (isSignedIn && clerkId) {
      initPurchases(clerkId);
    } else if (!isSignedIn) {
      resetPurchases();
    }
  }, [isSignedIn, clerkId]);
};

/** The store products to show on the paywall (prices come from the store, already localized). */
export const usePackages = () => {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  return useQuery({
    queryKey: ['purchasePackages', user?.id],
    queryFn: async () => {
      // initPurchases is idempotent; awaiting it here avoids racing the root-layout setup.
      if (!user?.id || !(await initPurchases(user.id))) return [];
      return getPackages();
    },
    enabled: !!isSignedIn && !!user?.id && purchasesAvailable(),
    staleTime: 5 * 60 * 1000,
  });
};

/** After a purchase/restore: ask OUR server to re-check RevenueCat, then refresh everything Premium touches. */
export const useRefreshPremium = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return async () => {
    const user = await userApi.syncPremium(api);
    queryClient.setQueryData(['currentUser'], user);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
      queryClient.invalidateQueries({ queryKey: ['groups'] }),
      queryClient.invalidateQueries({ queryKey: ['groupDetails'] }),
      queryClient.invalidateQueries({ queryKey: ['meetups'] }),
    ]);
    return user;
  };
};

export const usePurchasePackage = () => {
  const refresh = useRefreshPremium();
  return useMutation({
    mutationFn: async (pkg: Parameters<typeof purchase>[0]) => {
      const result = await purchase(pkg);
      if (result === 'purchased') await refresh();
      return result;
    },
  });
};

export const useRestorePurchases = () => {
  const refresh = useRefreshPremium();
  return useMutation({
    mutationFn: async () => {
      await restore();
      return refresh();
    },
  });
};
