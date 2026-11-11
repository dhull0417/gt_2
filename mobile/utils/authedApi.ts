import { createApiClient } from '@/utils/api';
import { waitForClerkToken } from '@/utils/authToken';
import { NoTokenError } from '@/utils/queuedMutations';

// Shared axios instance for mutations registered on the QueryClient (see
// utils/offlineMutations.ts) — these can run with no screen mounted (a
// mutation resumed after reconnect, or after an app restart), so they can't
// rely on useApiClient()'s hook-scoped instance.
// Waits for sign-in on a cold start; if it still isn't ready, fails with NoTokenError (which queued
// actions retry) rather than sending a request with no token, which the server would refuse.
export const authedApi = createApiClient(async () => {
  const token = await waitForClerkToken();
  if (!token) throw new NoTokenError();
  return token;
});
