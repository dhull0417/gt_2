import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useApiClient, userApi, type User } from "../utils/api";

/**
 * Whether the signed-in user has Premium. The server computes `isPremium`
 * (see backend/src/utils/premium.js); this hook is for UI only. The backend
 * enforces the actual gate, so never rely on this alone to protect a feature.
 */
export const usePremium = () => {
  const api = useApiClient();
  const { isSignedIn } = useAuth();
  const { data, isLoading } = useQuery<User, Error>({
    queryKey: ["currentUser"],
    queryFn: () => userApi.getCurrentUser(api),
    enabled: !!isSignedIn,
  });

  return { isPremium: data?.isPremium === true, isLoading };
};
