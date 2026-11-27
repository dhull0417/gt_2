import { clerkErrorMessage } from './clerkErrors';

/**
 * Google sign-in decisions, kept out of React so they can be tested with fake Clerk results.
 *
 * Android tries the native account sheet first (Credential Manager, no browser), and falls back
 * to a browser tab only when the sheet can't run. The browser tab prefers Chrome, because some
 * other default browsers don't hand the result back to the app and the sign-in would end silently.
 * iPhone always uses the browser flow (ASWebAuthenticationSession, which doesn't depend on the
 * default browser). See docs/specs/2026-11-11-android-native-google-signin-design.md.
 */

const CHROME_PACKAGE = 'com.android.chrome';

export interface BrowserInfo {
  browserPackages: string[];
  preferredBrowserPackage?: string;
}

/** The browser to run the sign-in tab in: Chrome if installed, else Android's preferred one. */
export function pickBrowserPackage(info: BrowserInfo): string | undefined {
  if (info.browserPackages.includes(CHROME_PACKAGE)) return CHROME_PACKAGE;
  return info.preferredBrowserPackage || undefined;
}

export const NOT_FINISHED_MESSAGE = "Google sign-in didn't finish. Please try again.";
export const INCOMPLETE_ACCOUNT_MESSAGE =
  "We couldn't finish setting up your account with Google. Please try again, or use another sign-in option.";
const GENERIC_FAILURE_MESSAGE = 'Failed to sign in with Google. Please try again.';

type SetActive = (params: { session: string }) => Promise<void>;

/** The parts of a Clerk `startGoogleAuthenticationFlow` / `startSSOFlow` result we look at. */
export interface ClerkFlowResult {
  createdSessionId: string | null;
  setActive?: SetActive;
  signUp?: { status?: string | null; missingFields?: string[] } | null;
  /** Browser flow only. */
  authSessionResult?: { type: string } | null;
}

export type GoogleOutcome =
  | { kind: 'session'; sessionId: string; setActive: SetActive }
  /** The person closed the native sheet: stay on sign-in quietly. */
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

export interface GoogleSignInDeps {
  /** `Platform.OS` */
  platform: string;
  /** Clerk's native flow (`useSignInWithGoogle().startGoogleAuthenticationFlow`). */
  startNative: () => Promise<ClerkFlowResult>;
  /** Clerk's browser flow (`useSSO().startSSOFlow` with `strategy: 'oauth_google'`). */
  startBrowser: (opts: { authSessionOptions?: { browserPackage?: string } }) => Promise<ClerkFlowResult>;
  /** `WebBrowser.getCustomTabsSupportingBrowsersAsync` */
  getBrowsers: () => Promise<BrowserInfo>;
  log?: (msg: string) => void;
}

const errorCode = (err: any): string => err?.code ?? err?.errors?.[0]?.code ?? err?.message ?? 'unknown';

/** A result with a session, an unfinished sign-up, or null when it's neither. */
function settled(result: ClerkFlowResult, log?: (msg: string) => void): GoogleOutcome | null {
  if (result.createdSessionId && result.setActive) {
    return { kind: 'session', sessionId: result.createdSessionId, setActive: result.setActive };
  }
  if (result.signUp?.status === 'missing_requirements') {
    log?.(`Google sign-up missing fields: ${(result.signUp.missingFields ?? []).join(', ')}`);
    return { kind: 'failed', message: INCOMPLETE_ACCOUNT_MESSAGE };
  }
  return null;
}

async function runBrowser(deps: GoogleSignInDeps, useCustomTabsChoice: boolean): Promise<GoogleOutcome> {
  let opts: { authSessionOptions?: { browserPackage?: string } } = {};
  if (useCustomTabsChoice) {
    try {
      const browserPackage = pickBrowserPackage(await deps.getBrowsers());
      if (browserPackage) opts = { authSessionOptions: { browserPackage } };
    } catch (err) {
      deps.log?.(`Couldn't list sign-in browsers: ${errorCode(err)}`);
    }
  }
  try {
    const result = await deps.startBrowser(opts);
    const outcome = settled(result, deps.log);
    if (outcome) return outcome;
    deps.log?.(`Google browser sign-in ended without a session: ${result.authSessionResult?.type ?? 'no result'}`);
    return { kind: 'failed', message: NOT_FINISHED_MESSAGE };
  } catch (err) {
    deps.log?.(`Google browser sign-in failed: ${errorCode(err)}`);
    return { kind: 'failed', message: clerkErrorMessage(err, GENERIC_FAILURE_MESSAGE) };
  }
}

/**
 * Runs Google sign-in and says how it ended. Never throws.
 * Android: native sheet first; a thrown native error falls back to the browser, a cancel doesn't.
 */
export async function runGoogleSignIn(deps: GoogleSignInDeps): Promise<GoogleOutcome> {
  if (deps.platform !== 'android') return runBrowser(deps, false);
  try {
    const result = await deps.startNative();
    // Clerk returns no session (rather than throwing) when the person closes the sheet.
    return settled(result, deps.log) ?? { kind: 'cancelled' };
  } catch (err) {
    deps.log?.(`Native Google sign-in unavailable, using the browser: ${errorCode(err)}`);
    return runBrowser(deps, true);
  }
}
