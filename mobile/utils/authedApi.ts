import { createApiClient } from '@/utils/api';
import { getClerkToken } from '@/utils/authToken';

// Shared axios instance for mutations registered on the QueryClient (see
// utils/offlineMutations.ts) — these can run with no screen mounted (a
// mutation resumed after reconnect, or after an app restart), so they can't
// rely on useApiClient()'s hook-scoped instance.
export const authedApi = createApiClient(() => getClerkToken());
