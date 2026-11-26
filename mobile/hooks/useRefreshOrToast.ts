import { useCallback, useRef, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { toast } from '@/contexts/ToastContext';
import { refreshOrToast } from '@/utils/offlineState';

/**
 * For pull-to-refresh: `refreshing` drives the RefreshControl; offline it never starts spinning.
 * Pass the refetch functions to run (the list is read on each pull, so inline arrays are fine).
 */
export function useRefreshOrToast(refreshers: Array<() => Promise<unknown>>) {
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(refreshers);
  latest.current = refreshers;
  const refresh = useCallback(async () => {
    const online = onlineManager.isOnline();
    if (online) setRefreshing(true);
    try {
      await refreshOrToast(online, latest.current, (m) => toast.info(m));
    } finally {
      if (online) setRefreshing(false);
    }
  }, []);
  return { refreshing, refresh };
}
