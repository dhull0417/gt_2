import axios from "axios";
import { onlineManager } from "@tanstack/react-query";

export const OFFLINE_ERROR_MESSAGE = "You need an internet connection to do that.";
export const SLOW_SERVER_MESSAGE = "GroupThat is taking too long to respond. Please try again.";

// The raw wording each layer uses when a request never reached anything: axios ("Network Error"),
// React Native's fetch, used by Supabase ("Network request failed"), Clerk ("ClerkJS: Network
// error at ..."), browsers' fetch ("Failed to fetch", "Load failed") and RevenueCat/iOS ("The
// internet connection appears to be offline").
const NETWORK_TEXT = /network (error|request failed)|failed to fetch|^(typeerror: )?load failed$|internet connection appears to be offline|not connected to the internet/i;

/** True when an error (or its message) means the request couldn't reach the internet at all. */
export function isNetworkFailure(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'string') return NETWORK_TEXT.test(error);
  if (typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown; response?: unknown };
  if (e.response) return false; // the server answered: whatever went wrong, it wasn't the network
  if (e.code === 'ERR_NETWORK' || e.code === 'network_error') return true;
  return typeof e.message === 'string' && NETWORK_TEXT.test(e.message);
}

/** For text that came from somewhere else (a library's error message): never show "Network Error". */
export function friendlyErrorText(text: string): string {
  return isNetworkFailure(text) ? OFFLINE_ERROR_MESSAGE : text;
}

/**
 * The message to show for a failed request. "No internet" only when that's actually the case:
 * the device is offline, or the request couldn't reach anything at all. A timeout while online is
 * a slow server (saying "check your connection" there blames the user for our outage).
 */
export function getErrorMessage(error: unknown, fallback: string, isOnline: boolean = onlineManager.isOnline()): string {
  if (axios.isAxiosError(error)) {
    if (error.response) return error.response.data?.error || fallback;
    if (error.code === "ERR_NETWORK" || !isOnline) return OFFLINE_ERROR_MESSAGE;
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return SLOW_SERVER_MESSAGE;
    return fallback;
  }
  // Not an axios error: Supabase/fetch and Clerk fail with their own "network" wording. And when
  // offline, anything else (e.g. the sign-in token couldn't be refreshed) is explained by that too.
  return isNetworkFailure(error) || !isOnline ? OFFLINE_ERROR_MESSAGE : fallback;
}

/**
 * NetInfo's "can we reach GroupThat?" check against GET /api/health (204). An older backend
 * without that route answers with Express's own 404 page, which still proves the server is
 * there - otherwise a backend behind the app would make the whole app think it's offline.
 * Anything else (a captive-portal login page, a redirect, an outage) counts as unreachable.
 */
export function isGroupThatReachable(status: number, body: string): boolean {
  if (status === 204) return true;
  return status === 404 && body.includes('Cannot GET /api/health');
}
