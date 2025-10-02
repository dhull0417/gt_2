import { useQuery } from "@tanstack/react-query";
import { useApiClient, notificationApi } from "../utils/api";

export const useGetNotifications = () => {
  const api = useApiClient();

  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationApi.getNotifications(api),
  });
};