import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { useApiClient, userApi, type User } from "../utils/api";

/**
 * Is the signed-in user this group's owner? Premium belongs to the owner, so only they can buy it
 * for the group. Pass group.owner (id or populated user). False for no owner or while loading.
 */
export const useIsGroupOwner = (owner?: string | { _id: string } | null): boolean => {
  const ownerId = typeof owner === "string" ? owner : owner?._id;
  const api = useApiClient();
  const { isSignedIn } = useAuth();
  const { data: me } = useQuery<User, Error>({
    queryKey: ["currentUser"],
    queryFn: () => userApi.getCurrentUser(api),
    enabled: !!isSignedIn,
  });
  return !!ownerId && !!me && me._id === ownerId;
};
