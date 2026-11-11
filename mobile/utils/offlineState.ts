import { onlineManager } from '@tanstack/react-query';

// Small, pure decisions about "offline vs. loading vs. broken", shared by screens and tested.

type FetchStatus = 'fetching' | 'paused' | 'idle';

export type CurrentUserGate = 'signed-out' | 'loading' | 'ready' | 'new-user' | 'offline' | 'failed';

/**
 * Where the signed-in user's record stands at app start. A query waiting for a connection is
 * "paused", not errored, so it needs its own state: before, an offline cold start with nothing
 * saved never left the splash screen.
 */
export function currentUserGate(s: {
  isSignedIn: boolean | undefined;
  hasUser: boolean;
  isError: boolean;
  errorStatus: number | undefined;
  fetchStatus: FetchStatus;
}): CurrentUserGate {
  if (!s.isSignedIn) return 'signed-out';
  if (s.hasUser) return 'ready';
  if (s.isError && s.errorStatus === 404) return 'new-user';
  if (s.isError) return 'failed';
  if (s.fetchStatus === 'paused') return 'offline';
  return 'loading';
}

export const OFFLINE_SAVED_DATA = "You're offline. Showing saved data.";

/**
 * Pull-to-refresh and Retry buttons. Offline, a refetch waits for the connection to come back, so
 * awaiting it kept the spinner going indefinitely. Instead: say we're offline and stop right away.
 */
export async function refreshOrToast(
  isOnline: boolean,
  refreshers: Array<() => Promise<unknown>>,
  notify: (message: string) => void,
): Promise<void> {
  if (!isOnline) {
    notify(OFFLINE_SAVED_DATA);
    return;
  }
  await Promise.allSettled(refreshers.map((r) => r()));
}

/**
 * A screen opened offline whose data was never loaded (or was cleared). React Query reports that
 * as "not loading, no data, no error", which screens used to render as an empty list ("no
 * meetups") or a loader that never ends. Saved-but-empty data is not this: that's a real answer.
 */
export function isOfflineEmpty(q: { fetchStatus: FetchStatus; data: unknown }): boolean {
  return q.fetchStatus === 'paused' && q.data === undefined;
}

/** The offline banner's wording for the screen underneath (the first route segment). */
export function offlineBannerText(firstSegment: string | undefined): string {
  if (firstSegment === '(auth)') return 'You need a connection to sign in';
  if (firstSegment === 'profile-setup') return 'You need a connection to finish setting up';
  return OFFLINE_SAVED_DATA;
}

/**
 * Guard for actions that must not be queued (delete/leave a group, remove someone, transfer
 * ownership, cancel a meetup or poll, delete the account). Checked before the "Are you sure?"
 * dialog, so nobody confirms something that can't happen right now.
 */
export function requireOnline(
  action: string,
  isOnline: boolean = onlineManager.isOnline(),
  notify: (message: string) => void = (m) => require('@/contexts/ToastContext').toast.error(m),
): boolean {
  if (isOnline) return true;
  notify(`You're offline. Connect to the internet to ${action}.`);
  return false;
}
