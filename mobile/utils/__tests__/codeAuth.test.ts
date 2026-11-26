import { startCode, verifyCode, resendCode, lookupForPassword } from '../codeAuth';

const ok = () => jest.fn().mockResolvedValue({ error: null });
const fail = (code = 'oops', message = 'Something broke') =>
  jest.fn().mockResolvedValue({ error: { errors: [{ code, message, longMessage: message }] } });

function fakes(overrides: { signIn?: any; signUp?: any } = {}) {
  const signIn: any = {
    status: 'needs_first_factor',
    supportedFirstFactors: [{ strategy: 'email_code' }],
    create: ok(),
    emailCode: { sendCode: ok(), verifyCode: ok() },
    phoneCode: { sendCode: ok(), verifyCode: ok() },
    finalize: ok(),
    ...overrides.signIn,
  };
  const signUp: any = {
    status: 'missing_requirements',
    create: ok(),
    verifications: { sendEmailCode: ok(), verifyEmailCode: ok(), sendPhoneCode: ok(), verifyPhoneCode: ok() },
    finalize: ok(),
    ...overrides.signUp,
  };
  return { signIn, signUp };
}

describe('startCode', () => {
  it('sends a sign-in code to an existing email', async () => {
    const c = fakes();
    const r = await startCode('email', 'sam@x.com', c);
    expect(r).toEqual({ ok: true, mode: 'signIn' });
    expect(c.signIn.create).toHaveBeenCalledWith({ identifier: 'sam@x.com' });
    expect(c.signIn.emailCode.sendCode).toHaveBeenCalled();
  });

  it('creates an account when the phone number is new', async () => {
    const c = fakes({ signIn: { create: fail('form_identifier_not_found') } });
    const r = await startCode('phone', '+18015551234', c);
    expect(r).toEqual({ ok: true, mode: 'signUp' });
    expect(c.signUp.create).toHaveBeenCalledWith({ phoneNumber: '+18015551234' });
    expect(c.signUp.verifications.sendPhoneCode).toHaveBeenCalled();
  });

  it('reports a failed send instead of moving on', async () => {
    const c = fakes({ signIn: { emailCode: { sendCode: fail('too_many_requests', 'Slow down'), verifyCode: ok() } } });
    const r = await startCode('email', 'sam@x.com', c);
    expect(r).toEqual({ ok: false, message: 'Slow down' });
  });

  it('reports a failed sign-up send', async () => {
    const c = fakes({
      signIn: { create: fail('form_identifier_not_found') },
      signUp: { verifications: { sendEmailCode: fail('x', 'Email blocked') } },
    });
    expect(await startCode('email', 'new@x.com', c)).toEqual({ ok: false, message: 'Email blocked' });
  });

  it('refuses an account that cannot use codes', async () => {
    const c = fakes({ signIn: { supportedFirstFactors: [{ strategy: 'password' }] } });
    const r = await startCode('email', 'sam@x.com', c);
    expect(r.ok).toBe(false);
  });
});

describe('verifyCode', () => {
  it('finalizes a completed sign-in', async () => {
    const c = fakes({ signIn: { status: 'complete' } });
    expect(await verifyCode('email', 'signIn', '123456', c)).toEqual({ ok: true });
    expect(c.signIn.emailCode.verifyCode).toHaveBeenCalledWith({ code: '123456' });
    expect(c.signIn.finalize).toHaveBeenCalled();
  });

  it('finalizes a completed phone sign-up', async () => {
    const c = fakes({ signUp: { status: 'complete' } });
    expect(await verifyCode('phone', 'signUp', '123456', c)).toEqual({ ok: true });
    expect(c.signUp.verifications.verifyPhoneCode).toHaveBeenCalledWith({ code: '123456' });
    expect(c.signUp.finalize).toHaveBeenCalled();
  });

  it('explains a sign-up that is not complete', async () => {
    const c = fakes();
    const r = await verifyCode('email', 'signUp', '123456', c);
    expect(r.ok).toBe(false);
    expect(c.signUp.finalize).not.toHaveBeenCalled();
  });

  it('passes on a wrong code', async () => {
    const c = fakes({ signIn: { emailCode: { sendCode: ok(), verifyCode: fail('form_code_incorrect', 'Incorrect code') } } });
    expect(await verifyCode('email', 'signIn', '000000', c)).toEqual({ ok: false, message: 'Incorrect code' });
  });
});

describe('resendCode', () => {
  it('resends through the matching call', async () => {
    const c = fakes();
    await resendCode('email', 'signUp', c);
    expect(c.signUp.verifications.sendEmailCode).toHaveBeenCalled();
    await resendCode('phone', 'signIn', c);
    expect(c.signIn.phoneCode.sendCode).toHaveBeenCalled();
  });
});

describe('lookupForPassword', () => {
  it('treats an unknown email as a new account', async () => {
    const c = fakes({ signIn: { create: fail('form_identifier_not_found') } });
    expect(await lookupForPassword('new@x.com', c.signIn)).toBe('new');
  });
  it('spots an account with no password', async () => {
    const c = fakes({ signIn: { supportedFirstFactors: [{ strategy: 'email_code' }] } });
    expect(await lookupForPassword('sam@x.com', c.signIn)).toBe('no-password');
  });
  it('finds an account with a password', async () => {
    const c = fakes({ signIn: { supportedFirstFactors: [{ strategy: 'email_code' }, { strategy: 'password' }] } });
    expect(await lookupForPassword('sam@x.com', c.signIn)).toBe('existing');
  });
  it('passes on other errors', async () => {
    const c = fakes({ signIn: { create: fail('form_param_format_invalid', 'Bad email') } });
    expect(await lookupForPassword('nope', c.signIn)).toEqual({ message: 'Bad email' });
  });
});
