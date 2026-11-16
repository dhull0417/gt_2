# Android native Google sign-in, with a browser backup (design, 2026-11-11)

**Size:** small project. One hook rewritten, one helper added, config and dashboard setup, one native Android build.

## Why
A tester's Google sign-in on Android (1.4.3) returned him to the sign-in screen with no message. Changing his default browser to Chrome fixed it. Today the app runs Google sign-in in a Custom Tab from the phone's default browser (`useSSO` → `expo-web-browser.openAuthSessionAsync`). Some non-Chrome browsers don't hand back a "success" result, and `startSSOFlow` then returns `createdSessionId: null` without throwing. `hooks/useSocialAuth.ts` only reacts to thrown errors, so it ends silently.

## Goals
- On Android, Google sign-in uses the system account sheet (Credential Manager through `@clerk/expo`'s `useSignInWithGoogle`), so the default browser doesn't matter.
- If the native sheet can't run (no Google Play services, a config error, any unexpected native error), fall back to the browser flow automatically.
- The browser backup works with a wide range of browsers: prefer a browser that supports Custom Tabs well (Chrome first), then the default.
- No attempt ends silently. Every outcome is a session, a deliberate user cancel (stay on sign-in, no message), or a clear message.
- Existing Google users keep their accounts: native sign-in resolves to the same Clerk user.

## Non-goals
- iPhone: stays on the current browser flow (`ASWebAuthenticationSession` doesn't depend on the default browser and works today).
- Apple sign-in: unchanged.
- One Tap / auto sign-in on app launch: not adding it.

## Anti-goals
- Don't create duplicate accounts for existing users (wrong Google Cloud project = new Google subject IDs = new users).
- Don't loop: a user cancel in the native sheet must not open the browser.

## Constraints
- `@clerk/expo` 3.2.10 already ships the Android native module (`androidx.credentials`, `googleid`). It needs `"@clerk/expo"` in `app.json` `plugins` and a new native build. `expo-crypto` is already installed.
- The new client IDs must come from the **same Google Cloud project** as the web client Clerk's Google connection uses today.
- Release builds are signed by Google Play (App Signing key). Dev/internal APKs use the EAS keystore. Both fingerprints need registering.
- `runtimeVersion: fingerprint`: this ships only in a new native build, not an OTA update.

## Approaches considered
- **A. Native on Android + browser backup + clear messages (chosen).** Best experience, and the backup preserves browser coverage.
- B. Harden the browser flow only. No setup, but still at the mercy of each browser.
- C. Native only. Locks out phones without Google Play services.

## Decisions
1. **Android flow:** `startGoogleAuthenticationFlow()` first.
   - Session → `setActive`.
   - Thrown error with code `SIGN_IN_CANCELLED` (or `-5`) → stop quietly.
   - Returned `createdSessionId: null` with no error (Clerk maps the "cancelled" and "no saved credential" responses here) → stop quietly. *(Claude's call: we can't tell those two apart from the hook's return value, and treating both as a cancel avoids a surprise browser popup after the user closed the sheet.)*
   - Any other thrown error (`NOT_CONFIGURED`, `GOOGLE_SIGN_IN_ERROR`, `E_ACTIVITY_UNAVAILABLE`, native module missing) → log the code, then run the browser flow.
2. **Browser flow (iPhone always, Android as backup):** `startSSOFlow({ strategy: 'oauth_google', authSessionOptions })`. On Android, pick `browserPackage` from `WebBrowser.getCustomTabsSupportingBrowsersAsync()`: `com.android.chrome` if listed, else `preferredBrowserPackage`, else leave unset. *(Claude's call: Chrome is on nearly every Android phone and is the browser Google tests against. If the lookup throws, leave it unset.)*
3. **Outcome handling (both flows):**
   - `authSessionResult.type` of `cancel` or `dismiss` → message: "Google sign-in didn't finish. Please try again." *(Claude's call: on Android, a broken browser hand-off also reports `dismiss`, so a message is safer than silence here.)*
   - `signUp.status === 'missing_requirements'` → message saying the account couldn't be finished, and log `signUp.missingFields`.
   - Thrown errors → the existing "Failed to sign in with Google" alert.
   - Any non-session outcome → `router.replace('/(auth)')` so nobody is stranded on `/sso-callback`.
4. **Structure:** keep the decisions in a pure, unit-tested helper (`utils/googleSignIn.ts`). `useSocialAuth.ts` wires the hooks to it. The sign-in screen doesn't change.

## Setup outside the code (Dallin)
1. **Find the existing web client.** Clerk Dashboard → SSO connections → Google: copy the Client ID. In Google Cloud Console, find the project that owns that client (APIs & Services → Credentials). Everything below happens in that project.
2. **Get fingerprints.**
   - Play App Signing key: Play Console → GroupThat → Test and release → App integrity → App signing → copy **SHA-1** and **SHA-256**.
   - EAS keystore (dev and internal APKs): `cd mobile && eas credentials -p android` → the build profile → Keystore → copy SHA-1 and SHA-256.
3. **Create Android OAuth clients** (Credentials → Create credentials → OAuth client ID → Android). Package `com.dallinhull.groupthat`. Create one with the Play signing SHA-1 and one with the EAS SHA-1. No secret is needed.
4. **Clerk → Native applications → Android:** package `com.dallinhull.groupthat`, add the SHA-256 fingerprints (Play signing key; EAS key too if it allows more than one).
5. **Env vars:** `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` = the existing web client ID; `EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID` = the Play-key Android client ID. Add them to expo.dev → Environment variables for development, preview and production, plus `mobile/.env.local` and `.env.example` (placeholder).
6. **Audience check:** confirm Google Auth Platform → Audience is "In production," so non-test users aren't blocked.

## Left to the builder
- Message wording beyond the lines above.
- Whether `app.json` `extra` carries the client IDs or only `process.env` (the Clerk hook reads both; prefer `process.env` via EAS so IDs stay out of git).

## Verification
- Unit tests for the helper's decision table.
- Device checks on the Play internal-testing build: native sheet with Chrome as default; native sheet with Firefox/Samsung Internet as default; cancel the sheet (stays on sign-in, no browser); an existing Google user lands on their existing account; forced fallback (build with a bad Android client ID) opens the browser and succeeds; iPhone unchanged.
