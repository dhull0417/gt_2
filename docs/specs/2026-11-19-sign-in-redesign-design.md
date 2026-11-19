# Sign-in redesign: design
_2026-11-19. Approach A (shared code sign-in) agreed with Dallin. Size: a medium project (about 10 files)._

## Intent
Sign-in and sign-up should feel like the rest of GroupThat, and be quicker and harder to get stuck in. Today the auth screens predate the design system: hard-coded grays and a coral back arrow. Email needs two screens plus a password. Phone has no resend button or code autofill. Profile setup can't be left.

## Goals
1. **Email offers both a code and a password**, for sign-in and sign-up alike. One email screen; the app works out whether the account is new.
2. **Phone sign-in fixed:** US numbers typed without `+1` work, send failures show an error, and it has resend and SMS code autofill.
3. **Welcome screen order:**
   - iOS: Apple, Google, Email shown; "More options" reveals Phone.
   - Android: Google, Email, Phone, with no toggle.
4. **"Not you? Sign out"** on profile setup.
5. **Every auth screen restyled** in the Create Group style with theme tokens, so dark mode is correct.

## Non-goals
Native Google sign-in (F6), Apple token revocation (F4), making the zip code optional (F7), name-modal changes (F10) and Clerk's `AuthView`. Each can follow separately.

## Anti-goals
- No new libraries.
- No Clerk SDK upgrade.
- No change to what Clerk requires. The dashboard is already set: email code, phone code and password are allowed; first and last name are enabled and optional.

## Flows
**Email.** A single field, then **Continue with code** (primary) or **Continue with password**.
- Code: send an email code. If the email has no account, create one with that email and send its verification code. Entering the code signs in, or finishes sign-up.
- Password, existing account: password field, then the current second-factor handling (unchanged logic), with "Forgot password?".
- Password, new account: create and confirm a password, then the email verification code (Clerk requires it).
- If someone picks password but their account has none (they signed up with a code or Google), say so and offer the code.

**Phone.** Same code flow, with the number normalized first: 10 digits become `+1…`; 11 digits starting with 1 become `+…`; anything starting with `+` is kept as is.

**Forgot / reset password.** Restyled. Reset uses the shared code form (gaining resend). The email is trimmed. A status other than `complete` shows a message instead of only logging.

## Structure
- `hooks/useCodeAuth.ts`: one hook for "send code → verify → sign in, or create the account". Parameterized by `'email' | 'phone'`, using Clerk's matching `emailCode` / `phoneCode` and `verifications.sendEmailCode` / `sendPhoneCode` calls.
- `utils/phone.ts`: `toE164US()`.
- `components/auth/AuthScreen.tsx`: the shared layout. A header with a back button in the brand color, a 26/900 title with a muted subtitle, a scrolling body, safe-area and keyboard handling, and theme colors.
- The existing `components/ui/Button` and `TextField` are used for every button and field.
- `VerificationCodeForm` is restyled onto them.
- Routes: a new `(auth)/email.tsx` replaces `sign-in.tsx` and `sign-up.tsx`, which are deleted. `phone-login.tsx`, `forgot-password.tsx` and `reset-password.tsx` are rebuilt on the shared pieces.
- Plus small edits to `(auth)/index.tsx` (button order) and `profile-setup/index.tsx` (sign-out link and an outdated comment).

## Testing
- Unit tests for `toE164US`.
- Unit tests for `useCodeAuth`'s decisions (sign-in vs sign-up, error paths), using fake Clerk objects.
- `tsc` clean and the full jest suite passing.
- Dallin checks on device: email code (new and existing), email password (new and existing), phone, forgot password, Apple and Google, iOS and Android, light and dark.

## Left to the builder
Exact copy text, spacing values within the existing theme scale, and icon choices.
