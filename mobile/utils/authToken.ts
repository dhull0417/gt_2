// Clerk's token getter is only available inside React via useAuth(). Mutation
// defaults registered on the QueryClient (for offline-queued/resumed mutations)
// run outside the component tree, including after an app restart before any
// chat screen has mounted — so they need a way to fetch a token without hooks.
// AuthLayout wires this up once auth is ready; until then callers get null.
type ClerkGetToken = (options?: { template?: string }) => Promise<string | null>;

let clerkGetToken: ClerkGetToken | null = null;

export function setClerkTokenGetter(fn: ClerkGetToken | null) {
  clerkGetToken = fn;
}

export function getClerkToken(options?: { template?: string }): Promise<string | null> {
  if (!clerkGetToken) return Promise.resolve(null);
  return clerkGetToken(options);
}
