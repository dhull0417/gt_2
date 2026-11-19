import { clerkErrorMessage } from './clerkErrors';

/**
 * Sign in or sign up with a one-time code, by email or by phone. Plain functions over Clerk's
 * signal objects (`useSignIn().signIn`, `useSignUp().signUp`) so the decisions can be tested
 * without React. Whether it's a sign-in or a new account is worked out here, so the person
 * never has to choose.
 */
export type CodeKind = 'email' | 'phone';
export type CodeMode = 'signIn' | 'signUp';
export type CodeResult = { ok: true; mode?: CodeMode } | { ok: false; message: string };
export interface ClerkPair { signIn: any; signUp: any }

const errorCode = (err: any): string | undefined => err?.errors?.[0]?.code ?? err?.code;
const fail = (err: any, fallback: string): CodeResult => ({ ok: false, message: clerkErrorMessage(err, fallback) });

const signInChannel = (kind: CodeKind, signIn: any) => (kind === 'email' ? signIn.emailCode : signIn.phoneCode);
const signUpSend = (kind: CodeKind, signUp: any) =>
  kind === 'email' ? signUp.verifications.sendEmailCode() : signUp.verifications.sendPhoneCode();
const signUpVerify = (kind: CodeKind, signUp: any, code: string) =>
  kind === 'email' ? signUp.verifications.verifyEmailCode({ code }) : signUp.verifications.verifyPhoneCode({ code });

/** Sends a code to `identifier` (an email, or a phone number already in +E.164 form). */
export async function startCode(kind: CodeKind, identifier: string, { signIn, signUp }: ClerkPair): Promise<CodeResult> {
  try {
    const { error } = await signIn.create({ identifier });
    if (!error) {
      const strategy = kind === 'email' ? 'email_code' : 'phone_code';
      const supported = (signIn.supportedFirstFactors ?? []).some((f: any) => f.strategy === strategy);
      if (!supported) {
        return { ok: false, message: kind === 'email'
          ? "This account can't get sign-in codes by email. Try your password or another sign-in option."
          : "This account can't get sign-in codes by text. Try another sign-in option." };
      }
      const { error: sendError } = await signInChannel(kind, signIn).sendCode();
      if (sendError) return fail(sendError, "We couldn't send the code.");
      return { ok: true, mode: 'signIn' };
    }
    if (errorCode(error) !== 'form_identifier_not_found') return fail(error, 'Something went wrong.');

    const { error: createError } = await signUp.create(kind === 'email' ? { emailAddress: identifier } : { phoneNumber: identifier });
    if (createError) return fail(createError, "We couldn't create your account.");
    const { error: sendError } = await signUpSend(kind, signUp);
    if (sendError) return fail(sendError, "We couldn't send the code.");
    return { ok: true, mode: 'signUp' };
  } catch (err) {
    return fail(err, 'Something went wrong.');
  }
}

/** Checks the code and, when that finishes the sign-in or sign-up, activates the session. */
export async function verifyCode(kind: CodeKind, mode: CodeMode, code: string, { signIn, signUp }: ClerkPair): Promise<CodeResult> {
  try {
    if (mode === 'signIn') {
      const { error } = await signInChannel(kind, signIn).verifyCode({ code });
      if (error) return fail(error, "That code didn't work.");
      if (signIn.status !== 'complete') {
        return { ok: false, message: "We couldn't finish signing you in. Please try again or use another sign-in option." };
      }
      await signIn.finalize();
      return { ok: true };
    }
    const { error } = await signUpVerify(kind, signUp, code);
    if (error) return fail(error, "That code didn't work.");
    if (signUp.status !== 'complete') {
      return { ok: false, message: "We couldn't finish creating your account. Please try again or use another sign-in option." };
    }
    await signUp.finalize();
    return { ok: true };
  } catch (err) {
    return fail(err, "That code didn't work.");
  }
}

export async function resendCode(kind: CodeKind, mode: CodeMode, { signIn, signUp }: ClerkPair): Promise<CodeResult> {
  try {
    const { error } = mode === 'signIn' ? await signInChannel(kind, signIn).sendCode() : await signUpSend(kind, signUp);
    return error ? fail(error, "We couldn't resend the code.") : { ok: true };
  } catch (err) {
    return fail(err, "We couldn't resend the code.");
  }
}

export type PasswordLookup = 'existing' | 'new' | 'no-password' | { message: string };

/** Before showing a password field: is this a new account, one with a password, or one without? */
export async function lookupForPassword(email: string, signIn: any): Promise<PasswordLookup> {
  try {
    const { error } = await signIn.create({ identifier: email });
    if (error) {
      return errorCode(error) === 'form_identifier_not_found'
        ? 'new'
        : { message: clerkErrorMessage(error, 'Something went wrong.') };
    }
    const hasPassword = (signIn.supportedFirstFactors ?? []).some((f: any) => f.strategy === 'password');
    return hasPassword ? 'existing' : 'no-password';
  } catch (err) {
    return { message: clerkErrorMessage(err, 'Something went wrong.') };
  }
}
