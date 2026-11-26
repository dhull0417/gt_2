// Clerk's token getter is only available inside React via useAuth(). Mutation
// defaults registered on the QueryClient (for offline-queued/resumed mutations)
// run outside the component tree, including after an app restart before any
// chat screen has mounted — so they need a way to fetch a token without hooks.
// AuthLayout wires this up once auth is ready; until then callers get null.
type ClerkGetToken = (options?: { template?: string }) => Promise<string | null>;

let clerkGetToken: ClerkGetToken | null = null;
// Callers of waitForClerkToken that arrived before sign-in had finished loading.
let waiters: Array<() => void> = [];

export function setClerkTokenGetter(fn: ClerkGetToken | null) {
  clerkGetToken = fn;
  if (fn) {
    const ready = waiters;
    waiters = [];
    ready.forEach((wake) => wake());
  }
}

export function hasClerkTokenGetter(): boolean {
  return clerkGetToken !== null;
}

export function getClerkToken(options?: { template?: string }): Promise<string | null> {
  if (!clerkGetToken) return Promise.resolve(null);
  return clerkGetToken(options);
}

/**
 * Like getClerkToken, but if sign-in hasn't finished loading yet (a queued RSVP or message being
 * resumed on a cold start) it waits for it instead of sending the request with no token, which
 * the server would reject. Gives up with null after `timeoutMs`.
 */
export function waitForClerkToken(options?: { template?: string }, timeoutMs = 5000): Promise<string | null> {
  if (clerkGetToken) return clerkGetToken(options);
  return new Promise((resolve) => {
    let done = false;
    const wake = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(clerkGetToken ? clerkGetToken(options) : null);
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      waiters = waiters.filter((w) => w !== wake);
      resolve(null);
    }, timeoutMs);
    waiters.push(wake);
  });
}
