/** Pulls a human-readable message out of the different error shapes Clerk's APIs throw/return. */
export function clerkErrorMessage(err: any, fallback: string): string {
  return (
    err?.errors?.[0]?.longMessage ||
    err?.errors?.[0]?.message ||
    err?.longMessage ||
    err?.message ||
    fallback
  );
}
