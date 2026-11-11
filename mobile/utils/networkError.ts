import axios from "axios";
import { onlineManager } from "@tanstack/react-query";

export const OFFLINE_ERROR_MESSAGE = "You need an internet connection to do that.";
export const SLOW_SERVER_MESSAGE = "GroupThat is taking too long to respond. Please try again.";

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
  // Not a request error (e.g. the sign-in token couldn't be refreshed): offline explains it.
  return isOnline ? fallback : OFFLINE_ERROR_MESSAGE;
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
