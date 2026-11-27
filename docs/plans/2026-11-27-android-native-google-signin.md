# Android native Google sign-in: plan

**Goal:** on Android, Google sign-in uses the system account sheet, falls back to a browser tab (Chrome first) when the sheet can't run, and never ends silently.

**Architecture:**
- The decisions (which flow, which browser, what each outcome means) live in plain functions in `utils/googleSignIn.ts`, tested with fake Clerk results.
- `hooks/useSocialAuth.ts` wires Clerk's `useSignInWithGoogle` and `useSSO`, `expo-web-browser` and the alerts to those functions. Its return shape (`{ isLoading, handleSocialAuth }`) doesn't change, so `app/(auth)/index.tsx` doesn't change.
- The native module comes from the new `@clerk/expo-google-signin` package and its config plugin.

**Tech:** Expo SDK 58, expo-router, `@clerk/expo` 4.17.4 (`@clerk/expo/google` for `useSignInWithGoogle`, `useSSO` for the browser), `@clerk/expo-google-signin` 1.1.0, `expo-web-browser` 58, jest-expo, `@testing-library/react-native`.

**Spec:** `docs/specs/2026-11-11-android-native-google-signin-design.md`

**Global constraints**
- User-facing text, exactly:
  - `NOT_FINISHED_MESSAGE` = "Google sign-in didn't finish. Please try again."
  - `INCOMPLETE_ACCOUNT_MESSAGE` = "We couldn't finish setting up your account with Google. Please try again, or use another sign-in option."
  - Browser-flow thrown errors: `clerkErrorMessage(err, "Failed to sign in with Google. Please try again.")` (so offline shows the shared offline text).
  - Alert title: "Google sign-in".
- Chrome's package name: `com.android.chrome`.
- Logs use `console.warn` with an error code or message only. Never log tokens, URLs with query strings, or emails.
- iPhone behaviour is unchanged: browser flow, no `browserPackage`.
- `app/(auth)/index.tsx`, `app/sso-callback.tsx` and `app/_layout.tsx` are not modified.
- Run tests with `npx jest --forceExit` from `mobile/` (the suite has a pre-existing open handle).
- Don't commit. Dallin commits the working tree.

**Review focus** (each has a test, in the task shown)
1. Cancelling the native sheet returns `cancelled` and never calls the browser flow (Task 2).
2. The native flow throwing (e.g. "native module is not available") falls back to the browser with `browserPackage: 'com.android.chrome'` when Chrome is listed (Task 2).
3. A browser `dismiss` with no session returns `NOT_FINISHED_MESSAGE`, not silence (Task 2).
4. The browser lookup throwing still opens the browser, with no `browserPackage` (Task 2).
5. A `failed` outcome alerts and routes to `/(auth)`; a `cancelled` outcome does neither (Task 3).

## Files
| File | Change |
|---|---|
| `mobile/utils/googleSignIn.ts` | new: `pickBrowserPackage`, `runGoogleSignIn`, message constants, types |
| `mobile/utils/__tests__/googleSignIn.test.ts` | new |
| `mobile/hooks/useSocialAuth.ts` | rewired onto `runGoogleSignIn` |
| `mobile/hooks/__tests__/useSocialAuth.test.tsx` | new |
| `mobile/package.json`, lockfile | add `@clerk/expo-google-signin` |
| `mobile/app.json` | add `"@clerk/expo-google-signin"` to `plugins` after `"@clerk/expo"` |

## Task 1: browser choice
**Files:** `mobile/utils/googleSignIn.ts` (create), `mobile/utils/__tests__/googleSignIn.test.ts` (create)

**Produces:**
```ts
export interface BrowserInfo { browserPackages: string[]; preferredBrowserPackage?: string }
export function pickBrowserPackage(info: BrowserInfo): string | undefined
```

- [ ] Write failing tests in `googleSignIn.test.ts`, `describe('pickBrowserPackage')`:
  - `returns Chrome when it is listed, even if another browser is preferred`: `{ browserPackages: ['org.mozilla.firefox', 'com.android.chrome'], preferredBrowserPackage: 'org.mozilla.firefox' }` → `'com.android.chrome'`.
  - `returns the preferred browser when Chrome is missing`: `{ browserPackages: ['org.mozilla.firefox'], preferredBrowserPackage: 'org.mozilla.firefox' }` → `'org.mozilla.firefox'`.
  - `returns undefined when nothing supports Custom Tabs`: `{ browserPackages: [] }` → `undefined`.
- [ ] Run `npx jest utils/__tests__/googleSignIn.test.ts --forceExit`; expect FAIL (cannot find module `../googleSignIn`).
- [ ] Implement `pickBrowserPackage` in `utils/googleSignIn.ts`.
- [ ] Run again; expect PASS. Run the full suite; expect all green.

## Task 2: the decision table
**Files:** `mobile/utils/googleSignIn.ts`, `mobile/utils/__tests__/googleSignIn.test.ts`

**Consumes:** `pickBrowserPackage` (Task 1), `clerkErrorMessage` (`utils/clerkErrors.ts`).

**Produces:**
```ts
export const NOT_FINISHED_MESSAGE: string
export const INCOMPLETE_ACCOUNT_MESSAGE: string
export interface ClerkFlowResult {
  createdSessionId: string | null;
  setActive?: (p: { session: string }) => Promise<void>;
  signUp?: { status?: string | null; missingFields?: string[] } | null;
  authSessionResult?: { type: string } | null; // browser flow only
}
export type GoogleOutcome =
  | { kind: 'session'; sessionId: string; setActive: (p: { session: string }) => Promise<void> }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };
export interface GoogleSignInDeps {
  platform: string; // Platform.OS
  startNative: () => Promise<ClerkFlowResult>;
  startBrowser: (opts: { authSessionOptions?: { browserPackage?: string } }) => Promise<ClerkFlowResult>;
  getBrowsers: () => Promise<BrowserInfo>;
  log?: (msg: string) => void;
}
export async function runGoogleSignIn(deps: GoogleSignInDeps): Promise<GoogleOutcome>
```

**Rules the tests pin down:**
- Android: call `startNative` first.
  - Session + `setActive` → `session`.
  - `createdSessionId: null`, and `signUp.status === 'missing_requirements'` → `failed` / `INCOMPLETE_ACCOUNT_MESSAGE` (log the `missingFields`).
  - `createdSessionId: null` otherwise → `cancelled`. `startBrowser` is not called.
  - Throws → log, then the browser flow with `authSessionOptions: { browserPackage: pickBrowserPackage(await getBrowsers()) }`. If `getBrowsers` throws, call `startBrowser({})`.
- Any other platform: browser flow only, with `startBrowser({})`.
- Browser flow:
  - Session + `setActive` → `session`.
  - `missing_requirements` → `failed` / `INCOMPLETE_ACCOUNT_MESSAGE`.
  - Any other no-session result (`cancel`, `dismiss`, a missing `authSessionResult`, or `success` without a session) → `failed` / `NOT_FINISHED_MESSAGE`.
  - Throws → `failed` / `clerkErrorMessage(err, "Failed to sign in with Google. Please try again.")`.

- [ ] Write failing tests, `describe('runGoogleSignIn')`, using `jest.fn()` deps:
  1. `android: native session is returned and the browser is never opened`
  2. `android: native cancel returns cancelled and never opens the browser` (review focus 1)
  3. `android: native missing_requirements fails with the incomplete-account message`
  4. `android: native throw falls back to the browser in Chrome` → `startBrowser` called with `{ authSessionOptions: { browserPackage: 'com.android.chrome' } }` (review focus 2)
  5. `android: browser lookup failing still opens the browser without a package` → `startBrowser` called with `{}` (review focus 4)
  6. `ios: goes straight to the browser with no package`
  7. `browser dismiss without a session fails with the not-finished message` (review focus 3)
  8. `browser cancel without a session fails with the not-finished message`
  9. `browser missing_requirements fails with the incomplete-account message`
  10. `browser throw fails with the Clerk error message` (an error `{ errors: [{ longMessage: 'Boom' }] }` → message `'Boom'`)
- [ ] Run; expect FAIL (`runGoogleSignIn` is not a function).
- [ ] Implement `runGoogleSignIn` and the constants.
- [ ] Run; expect PASS. Full suite green.

## Task 3: wire the hook, add the native package
**Files:** `mobile/hooks/useSocialAuth.ts`, `mobile/hooks/__tests__/useSocialAuth.test.tsx` (create), `mobile/package.json`, the lockfile, `mobile/app.json`

**Consumes:** `runGoogleSignIn` and the types (Task 2).

**Produces:** `useSocialAuth(): { isLoading: boolean; handleSocialAuth: (strategy: 'oauth_google') => Promise<void> }` (unchanged shape).

- [ ] Write failing tests in `useSocialAuth.test.tsx`. Mock `@clerk/expo` (`useSSO`), `@clerk/expo/google` (`useSignInWithGoogle`), `expo-web-browser` (`getCustomTabsSupportingBrowsersAsync`), `expo-router` (`useRouter` → `{ replace }`) and `Alert.alert`. Set `Platform.OS = 'android'`.
  - `calls setActive with the new session and does not alert`
  - `alerts "Google sign-in" with the message and routes to /(auth) when sign-in fails` (native throws, browser returns `{ createdSessionId: null, authSessionResult: { type: 'dismiss' } }`) (review focus 5)
  - `does nothing visible when the native sheet is cancelled`: no alert, no `replace` (review focus 5)
  - `alerts and routes to /(auth) when setActive throws`
  - `isLoading is true during sign-in and false after`
- [ ] Run; expect FAIL (`useSignInWithGoogle` is never called).
- [ ] Rewrite `useSocialAuth`:
  - Build `GoogleSignInDeps`:
    - `startNative` is `startGoogleAuthenticationFlow()`.
    - `startBrowser` is `(o) => startSSOFlow({ strategy: 'oauth_google', ...o })`.
    - `getBrowsers` is `WebBrowser.getCustomTabsSupportingBrowsersAsync`.
    - `log` is `console.warn`.
  - On `session`, call `setActive`.
  - On `failed`, call `Alert.alert('Google sign-in', message)` and `router.replace('/(auth)')`.
  - On `cancelled`, do nothing.
  - Wrap everything in try/finally for `isLoading`. If anything throws outside the helper (such as `setActive`), alert the generic message and route back.
  - Keep the Android `/sso-callback` comment.
- [ ] Run; expect PASS. Full suite green. Run `npx tsc --noEmit`; expect clean.
- [ ] Run `npx expo install @clerk/expo-google-signin` and expect `1.1.x` in `package.json`.
  - Add `"@clerk/expo-google-signin"` right after `"@clerk/expo"` in `app.json` `plugins`.
  - Run `npx expo config --type prebuild > /dev/null` and expect no error.
  - Run the full suite and `tsc` again.

## Task 4: build and check on devices (manual; Dallin with Claude)
- [ ] `cd mobile && eas build -p android --profile preview`. Upload to Play internal testing.
- [ ] On an Android phone with **Chrome** as default: the account sheet appears, there's no browser, and you land in the app.
- [ ] Same phone with **Firefox or Samsung Internet** as default: same result.
- [ ] Close the sheet without picking: you stay on sign-in, see no message, and no browser opens.
- [ ] An existing Google user (you) lands on your existing account, not profile setup.
- [ ] A new Google account reaches profile setup.
- [ ] Fallback, on a dev build: blank `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` in `.env.local`, then run. The browser opens in Chrome and sign-in works. Restore the value.
- [ ] iPhone: Google sign-in behaves exactly as before.
- [ ] If the sheet shows a "developer error" or [28444]-style error, check that the Play-signing SHA-1/SHA-256 match what's registered in Google Cloud and Clerk.
