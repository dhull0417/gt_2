import axios from "axios";

export const OFFLINE_ERROR_MESSAGE = "You need an internet connection to do that.";

// A timed-out request (ECONNABORTED, from the 5s timeout in createApiClient)
// or one that never got a response at all almost always means the device
// has no usable connection right now, rather than a real server error - so
// surface the offline message instead of a generic/backend one.
export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED" || !error.response) return OFFLINE_ERROR_MESSAGE;
    return error.response.data?.error || fallback;
  }
  return fallback;
}
