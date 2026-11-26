import { isNetworkFailure, OFFLINE_ERROR_MESSAGE } from './networkError';

/** Pulls a human-readable message out of the different error shapes Clerk's APIs throw/return. */
export function clerkErrorMessage(err: any, fallback: string): string {
  // Offline, Clerk throws "ClerkJS: Network error at <url> - TypeError: Network request failed".
  if (isNetworkFailure(err)) return OFFLINE_ERROR_MESSAGE;
  const text =
    err?.errors?.[0]?.longMessage ||
    err?.errors?.[0]?.message ||
    err?.longMessage ||
    err?.message ||
    fallback;
  return typeof text === 'string' ? (isNetworkFailure(text) ? OFFLINE_ERROR_MESSAGE : text) : fallback;
}
