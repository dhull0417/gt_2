import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useQuery } from '@tanstack/react-query';
import { useApiClient, notificationApi } from '@/utils/api';

/** Keeps the app-icon badge equal to the number of unread notifications; cleared when signed out. */
export function useAppBadge(isSignedIn: boolean, hasBackendUser: boolean) {
  const api = useApiClient();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationApi.getNotifications(api),
    enabled: isSignedIn && hasBackendUser,
  });
  const unread = isSignedIn && hasBackendUser ? (data?.filter((n) => !n.read).length ?? 0) : 0;

  useEffect(() => {
    Notifications.setBadgeCountAsync(unread).catch(() => {});
  }, [unread]);
}
