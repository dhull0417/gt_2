# Sign-in redesign: plan

**Goal:** sign-in by email (code or password), a fixed phone flow, platform-specific welcome order and a profile-setup sign-out, all on one shared auth layout in the app's current style.

**Architecture:**
- The Clerk decision logic lives in plain functions in `utils/codeAuth.ts`, so it can be tested with fake Clerk objects.
- `hooks/useCodeAuth.ts` wraps those functions with loading and error state.
- Screens are thin, built from `AuthScreen` plus the shared `Button`, `TextField` and `VerificationCodeForm`.

**Tech:** Expo SDK 54, expo-router, `@clerk/expo` 3.2.10 with the signal API (`signIn.emailCode`/`phoneCode`, `signUp.verifications`), jest-expo, `@testing-library/react-native`.

**Spec:** `docs/specs/2026-11-19-sign-in-redesign-design.md`

**Global constraints**
- Colors come only from `useThemeColors()`. The exceptions are `#FFFFFF` text on brand buttons and Apple's own button.
- Sizes come from `constants/theme.ts` (`fontSize`, `radius`).
- Titles are 26 px, weight 900, `textPrimary`. Subtitles are 15 px, `textMuted`.
- The back button is a Feather `chevron-left` at 28 px in `colors.brand`.
- Primary actions use `<Button size="lg">`. Secondary actions use `variant="outline"`.
- Every Clerk `{ error }` result is checked. User-facing text goes through `clerkErrorMessage`.
- No new dependencies.

**Review focus** (each has a test, in the task shown)
1. A failed code send keeps the person on the entry step with a message (Task 2).
2. Choosing password with an unknown email goes to "create a password" (Task 2).
3. Choosing password on an account with no password says so and offers a code (Task 2).
4. Phone numbers typed with punctuation, like `(801) 555-1234`, normalize (Task 1).
5. A sign-up that ends incomplete (not `complete`) returns a message, not a silent stop (Task 2).

## Files
| File | Change |
|---|---|
| `utils/phone.ts` | new: `toE164US` |
| `utils/codeAuth.ts` | new: `startCode`, `verifyCode`, `resendCode`, `lookupForPassword` |
| `hooks/useCodeAuth.ts` | new: hook around codeAuth |
| `components/auth/AuthScreen.tsx` | new: shared layout |
| `components/auth/VerificationCodeForm.tsx` | restyle onto `TextField`/`Button`, same props |
| `utils/authOptions.ts` | new: `authButtonOrder(platform)` |
| `app/(auth)/email.tsx` | new; replaces `sign-in.tsx` and `sign-up.tsx` (both deleted) |
| `app/(auth)/phone-login.tsx` | rebuilt on the hook and the layout |
| `app/(auth)/forgot-password.tsx`, `reset-password.tsx` | restyled, plus the fixes |
| `app/(auth)/index.tsx` | button order, email route |
| `app/profile-setup/index.tsx` | sign-out link, comment |

## Task 1: phone normalization
- [ ] Test `utils/__tests__/phone.test.ts`:
  - `toE164US('8015551234')` → `'+18015551234'`
  - `'(801) 555-1234'` → `'+18015551234'`
  - `'1 801 555 1234'` → `'+18015551234'`
  - `'+44 20 7946 0958'` → `'+442079460958'`
  - `''` → `''`
- [ ] Run it and expect FAIL (cannot find module).
- [ ] Implement `export function toE164US(raw: string): string` in `utils/phone.ts`.
- [ ] Run it and expect PASS. Run the full suite.

## Task 2: code-auth logic
`type Kind = 'email' | 'phone'`, `type Mode = 'signIn' | 'signUp'`, `type Result = { ok: true; mode?: Mode } | { ok: false; message: string }`. `clerk = { signIn, signUp }` uses the signal objects.

| Function | Behaviour |
|---|---|
| `startCode(kind, identifier, clerk)` | `signIn.create({ identifier })`; on success, `signIn.emailCode`/`phoneCode.sendCode()` → `{ ok: true, mode: 'signIn' }`. On `form_identifier_not_found`: `signUp.create({ emailAddress \| phoneNumber })`, then `verifications.sendEmailCode`/`sendPhoneCode` → `mode: 'signUp'`. Any error → `{ ok: false, message }`. |
| `verifyCode(kind, mode, code, clerk)` | Verify with the matching call. Status `complete` → `finalize()` → `{ ok: true }`. Otherwise `{ ok: false, message }`. |
| `resendCode(kind, mode, clerk)` | Calls the matching send again. |
| `lookupForPassword(email, signIn)` | Returns `'existing' \| 'new' \| 'no-password' \| { message }`, based on whether `supportedFirstFactors` includes `'password'`. |

- [ ] Test `utils/__tests__/codeAuth.test.ts` with fake `signIn`/`signUp` objects (`jest.fn` resolving `{ error }`):
  - existing email → `signIn` mode and `emailCode.sendCode` called
  - unknown phone → `signUp.create({ phoneNumber })` and `sendPhoneCode` called
  - a send error → `ok: false` (review focus 1)
  - `verifyCode` with status `complete` → `finalize` called; status `missing_requirements` → `ok: false` (focus 5)
  - `lookupForPassword`: not found → `'new'` (focus 2); no password factor → `'no-password'` (focus 3); password factor → `'existing'`
- [ ] Run it and expect FAIL. Implement. Run and expect PASS. Run the full suite.

## Task 3: `useCodeAuth` hook
- [ ] `useCodeAuth(kind)` returns `{ step: 'enter' | 'code', destination, isLoading, start(identifier), verify(code), resend(), back() }`.
  - It uses `useSignIn`/`useSignUp` from `@clerk/expo` and the Task 2 functions.
  - A failure shows `Alert.alert` with the message plus `haptic.error()`.
  - It wires `useAndroidBack(step === 'code', back)`.
- [ ] Covered by Task 2 for logic and by Tasks 5–6 render tests. `tsc` must be clean.

## Task 4: shared layout and code form
- [ ] `AuthScreen({ title, subtitle?, onBack?, children, footer? })` provides:
  - the safe area and `colors.background`
  - `KeyboardAvoidingView` (padding on iOS, height on Android)
  - a header with the back chevron
  - a `ScrollView` with `keyboardShouldPersistTaps="handled"` and 24 px padding
- [ ] Restyle `VerificationCodeForm` onto `TextField` (center aligned, letter spacing 6, size 24) and `Button size="lg"`.
  - Props are unchanged.
  - The title and subtitle move out to the caller's `AuthScreen`, so the form takes an optional `showHeading` (default true) to stay backward-compatible with any other users.
- [ ] Render test `components/__tests__/VerificationCodeForm.test.tsx`: Verify is disabled under 4 digits, and `onSubmit('123456')` is called on press.

## Task 5: email screen
- [ ] Render test `app/__tests__/email.test.tsx` (Clerk mocked):
  - Entering an email and tapping **Continue with code** calls `startCode('email', …)` and shows the code form.
  - **Continue with password** with lookup `'no-password'` shows the "no password" message and an **Email me a code** button.
- [ ] Run it and expect FAIL. Build `app/(auth)/email.tsx` with these steps:
  1. **Enter:** email, then the two buttons.
  2. **Code:** `VerificationCodeForm` with `resend`.
  3. **Password, existing:** the password and second-factor logic moved from `sign-in.tsx`, plus a **Forgot password?** link.
  4. **Password, new:** create and confirm, logic moved from `sign-up.tsx`, then the code step.
  5. **No password:** a message with **Email me a code**.
- [ ] Delete `sign-in.tsx` and `sign-up.tsx`. `index.tsx` routes to `/(auth)/email`.
- [ ] Run it and expect PASS. Run the full suite and `tsc`.

## Task 6: phone screen
- [ ] Render test: typing `(801) 555-1234` and tapping **Send code** calls `startCode('phone', '+18015551234', …)`.
- [ ] Run it and expect FAIL. Rebuild `phone-login.tsx` on `AuthScreen`, `TextField` and `useCodeAuth('phone')`. Run and expect PASS. Run the full suite.

## Task 7: forgot and reset password
- [ ] Restyle both on `AuthScreen`, `TextField` and `Button`.
- [ ] Trim the email.
- [ ] Reset uses `VerificationCodeForm`-style resend (`signIn.resetPasswordEmailCode.sendCode()`).
- [ ] A status other than `complete` shows an alert.
- [ ] Verify with `tsc` and the full suite.

## Task 8: welcome screen order
- [ ] Test `utils/__tests__/authOptions.test.ts`:
  - `authButtonOrder('ios')` → `{ primary: ['apple','google','email'], more: ['phone'] }`
  - `authButtonOrder('android')` → `{ primary: ['google','email','phone'], more: [] }`
- [ ] Run it and expect FAIL. Implement `utils/authOptions.ts`.
- [ ] Render `index.tsx` from the order. The "More options" toggle shows only when `more` isn't empty. Restyle the Google, Email and Phone buttons with theme tokens. Disable the Apple button while Google is loading (render the spinner view).
- [ ] Run it and expect PASS. Run the full suite.

## Task 9: profile setup sign-out
- [ ] Add a "Not you? **Sign out**" link under Save that calls `unregisterPushToken(api)`, then `queryClient.clear()`, then `signOut()`. This is the same sequence as the Profile tab.
- [ ] Replace the outdated comment about never writing the name to Clerk.
- [ ] Verify with `tsc` and the full suite.

## Task 10: final check
- [ ] Reread the spec and tick every goal.
- [ ] `tsc --noEmit` is clean and jest passes.
- [ ] A fresh reviewer agent checks the diff against the spec.
- [ ] Hand Dallin the on-device checklist from the spec.
