import { useQuery } from "@tanstack/react-query";
import { useApiClient, userApi } from "../utils/api";

export const useSearchUsers = (username: string) => {
  const api = useApiClient();

  return useQuery({
    queryKey: ['userSearch', username],
    queryFn: () => userApi.searchUsers(api, username),
    enabled: !!username && username.length > 2, // Only search when query is long enough
    staleTime: 1000 * 60, // Cache results for 1 minute
  });
};