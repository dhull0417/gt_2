# Android native Google sign-in, with a browser backup (design)

_Written 2026-11-11, updated 2026-11-27 for Clerk 4.17 / Expo SDK 58 and the finished outside setup._

**Size:** small project. One hook rewritten, one helper added, a package and a config plugin added, one native Android build.

## Why
A tester's Google sign-in on Android (1.4.3) returned him to the sign-in screen with no message. Changing his default browser to Chrome fixed it. Today the app runs Google sign-in in a Custom Tab from the phone's default browser (`useSSO` → `expo-web-browser.openAuthSessionAsync`). Some non-Chrome browsers don't hand back a "success" result, and `startSSOFlow` then returns `createdSessionId: null` without throwing. `hooks/useSocialAuth.ts` only reacts to thrown errors, so it ends silently.

## Goals
- On Android, Google sign-in uses the system account sheet (Credential Manager through Clerk's `useSignInWithGoogle`), so the default browser doesn't matter.
- If the native sheet can't run (no Google Play services, a config error, the native module missing, any unexpected native error), fall back to the browser flow automatically.
- The browser backup works with a wide range of browsers: prefer Chrome when installed, then the browser Android reports as preferred, then the default.
- No attempt ends silently. Every outcome is a session, a deliberate user cancel (stay on sign-in, no message), or a clear message.
- Existing Google users keep their accounts: native sign-in resolves to the same Clerk user.

## Non-goals
- iPhone: stays on the current browser flow (`ASWebAuthenticationSession` doesn't depend on the default browser and works today). No iOS client ID or URL scheme.
- Apple, email and phone sign-in: unchanged.
- One Tap / auto sign-in on app launch.

## Anti-goals
- No duplicate accounts for existing users.
- No loop: cancelling the native sheet must not open the browser.

## Constraints
- `@clerk/expo` is 4.17.4 and Expo is SDK 58. In Clerk 4.x the Android native module lives in a separate package, **`@clerk/expo-google-signin`** (latest 1.1.0, peer `expo >=54 <59`). It must be installed with `npx expo install` and added to `app.json` `plugins` next to the existing `"@clerk/expo"`. Without it, the hook throws "ClerkGoogleSignIn native module is not available."
- `expo-crypto` is already installed (used for the nonce).
- `runtimeVersion: fingerprint`: ships only in a new native build, not an OTA update.
- Clerk 4.17's hook already turns a user cancel (`SIGN_IN_CANCELLED` or a non-success response) into `createdSessionId: null` rather than throwing. Anything it throws is a real failure.

## Setup outside the code (done 2026-11-27)
- Google Cloud project `groupthat-eb006` (number 1038362059568), the same project as Clerk's existing web client. Publishing status: In production, External.
  - Web client `GroupThat Production - Clerk`: `1038362059568-jvpofpi3j3crot51d2s1hcm6jaa2tvcq.apps.googleusercontent.com` (already in Clerk's Google connection).
  - Android client `GroupThat Android (Play signing)`: `1038362059568-4ugclualcha1hk2uhcj7o96o79ibdlsd.apps.googleusercontent.com`, SHA-1 `5B:6D:5D:E0:B6:63:E9:E6:D7:35:F5:28:32:B3:D7:B3:5B:FE:E7:1B`.
  - Android client `GroupThat Android (upload/dev)`: `1038362059568-d7k7jrv2p30iaq58mal1vdajb6fb8ukk.apps.googleusercontent.com`, SHA-1 `81:B5:8E:DB:FD:D0:FF:B2:75:95:07:01:F0:09:A0:5E:56:7B:B5:48`.
- Clerk Production → Native applications → Android: `com.dallinhull.groupthat` with the app signing SHA-256 `2A:DC:47:…:94:1C` (upload key SHA-256 `5E:72:57:…:6B:A3` if it accepted a second).
- EAS environment variables (development, preview, production) and `mobile/.env.local`: `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` = web client, `EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID` = Play-signing client. `.env.example` has blank placeholders.

## Approaches considered
- **A. Native on Android + browser backup + clear messages (chosen).** Best experience; the backup keeps browser coverage.
- B. Harden the browser flow only. No setup, but still at the mercy of each browser.
- C. Native only. Locks out phones without Google Play services.

## Decisions
1. **Android flow:** `startGoogleAuthenticationFlow()` from `@clerk/expo/google` first.
   - Session → `setActive`.
   - `createdSessionId: null` (Clerk's mapping of cancel and "no saved credential") → stop quietly, stay on sign-in. *(Claude's call: the two can't be told apart from the return value, and treating both as a cancel avoids a surprise browser after the user closed the sheet.)*
   - Anything thrown → log the code/message, then run the browser flow.
2. **Browser flow (iPhone always, Android as backup):** `startSSOFlow({ strategy: 'oauth_google', authSessionOptions })`. On Android, `browserPackage` comes from `WebBrowser.getCustomTabsSupportingBrowsersAsync()`: `com.android.chrome` if in `browserPackages`, else `preferredBrowserPackage`, else unset. If the lookup throws, leave it unset. *(Claude's call.)* This only picks the browser for the sign-in tab; it doesn't change the phone's default.
3. **Outcome handling:**
   - Browser `authSessionResult.type` of `cancel` or `dismiss` → message: "Google sign-in didn't finish. Please try again." *(Claude's call: on Android a broken browser hand-off also reports `dismiss`, so a message is safer than silence.)*
   - `signUp.status === 'missing_requirements'` (either flow) → message that the account couldn't be finished; log `signUp.missingFields`.
   - Thrown errors from the browser flow → the existing "Failed to sign in with Google" alert.
   - Any non-session outcome → `router.replace('/(auth)')` so nobody is stranded on `/sso-callback`.
4. **Structure:** the decisions live in a pure, unit-tested helper (`utils/googleSignIn.ts`). `hooks/useSocialAuth.ts` wires Clerk's hooks and the alerts to it. The sign-in screen doesn't change.

## Left to the builder
- Message wording beyond the lines above.

## Verification
- Unit tests for the helper's decision table.
- Device checks on a Play internal-testing build: native sheet with Chrome as default; native sheet with Firefox or Samsung Internet as default; cancel the sheet (stays on sign-in, no browser); an existing Google user lands on their existing account; a new Google user reaches profile setup; iPhone unchanged.
- Fallback check on a dev build: temporarily blank `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` locally so the native path throws; the browser opens in Chrome and signs in.
