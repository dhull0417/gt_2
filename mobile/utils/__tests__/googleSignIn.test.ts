import { pickBrowserPackage } from '../googleSignIn';

describe('pickBrowserPackage', () => {
  it('returns Chrome when it is listed, even if another browser is preferred', () => {
    expect(
      pickBrowserPackage({
        browserPackages: ['org.mozilla.firefox', 'com.android.chrome'],
        preferredBrowserPackage: 'org.mozilla.firefox',
      }),
    ).toBe('com.android.chrome');
  });

  it('returns the preferred browser when Chrome is missing', () => {
    expect(
      pickBrowserPackage({ browserPackages: ['org.mozilla.firefox'], preferredBrowserPackage: 'org.mozilla.firefox' }),
    ).toBe('org.mozilla.firefox');
  });

  it('returns undefined when nothing supports Custom Tabs', () => {
    expect(pickBrowserPackage({ browserPackages: [] })).toBeUndefined();
  });
});

import {
  runGoogleSignIn,
  NOT_FINISHED_MESSAGE,
  INCOMPLETE_ACCOUNT_MESSAGE,
  type GoogleSignInDeps,
} from '../googleSignIn';

const CHROME = { browserPackages: ['org.mozilla.firefox', 'com.android.chrome'], preferredBrowserPackage: 'org.mozilla.firefox' };

function makeDeps(overrides: Partial<GoogleSignInDeps> = {}): GoogleSignInDeps {
  return {
    platform: 'android',
    startNative: jest.fn(),
    startBrowser: jest.fn(),
    getBrowsers: jest.fn().mockResolvedValue(CHROME),
    log: jest.fn(),
    ...overrides,
  };
}

describe('runGoogleSignIn', () => {
  const setActive = jest.fn();

  it('android: native session is returned and the browser is never opened', async () => {
    const deps = makeDeps({ startNative: jest.fn().mockResolvedValue({ createdSessionId: 'sess_1', setActive }) });
    await expect(runGoogleSignIn(deps)).resolves.toEqual({ kind: 'session', sessionId: 'sess_1', setActive });
    expect(deps.startBrowser).not.toHaveBeenCalled();
  });

  it('android: native cancel returns cancelled and never opens the browser', async () => {
    const deps = makeDeps({ startNative: jest.fn().mockResolvedValue({ createdSessionId: null, setActive }) });
    await expect(runGoogleSignIn(deps)).resolves.toEqual({ kind: 'cancelled' });
    expect(deps.startBrowser).not.toHaveBeenCalled();
  });

  it('android: native missing_requirements fails with the incomplete-account message', async () => {
    const deps = makeDeps({
      startNative: jest.fn().mockResolvedValue({
        createdSessionId: null,
        setActive,
        signUp: { status: 'missing_requirements', missingFields: ['phone_number'] },
      }),
    });
    await expect(runGoogleSignIn(deps)).resolves.toEqual({ kind: 'failed', message: INCOMPLETE_ACCOUNT_MESSAGE });
    expect(deps.startBrowser).not.toHaveBeenCalled();
  });

  it('android: native throw falls back to the browser in Chrome', async () => {
    const deps = makeDeps({
      startNative: jest.fn().mockRejectedValue(new Error('ClerkGoogleSignIn native module is not available.')),
      startBrowser: jest.fn().mockResolvedValue({ createdSessionId: 'sess_2', setActive, authSessionResult: { type: 'success' } }),
    });
    await expect(runGoogleSignIn(deps)).resolves.toEqual({ kind: 'session', sessionId: 'sess_2', setActive });
    expect(deps.startBrowser).toHaveBeenCalledWith({ authSessionOptions: { browserPackage: 'com.android.chrome' } });
  });

  it('android: browser lookup failing still opens the browser without a package', async () => {
    const deps = makeDeps({
      startNative: jest.fn().mockRejectedValue(new Error('NOT_CONFIGURED')),
      getBrowsers: jest.fn().mockRejectedValue(new Error('no activity')),
      startBrowser: jest.fn().mockResolvedValue({ createdSessionId: 'sess_3', setActive, authSessionResult: { type: 'success' } }),
    });
    await expect(runGoogleSignIn(deps)).resolves.toEqual({ kind: 'session', sessionId: 'sess_3', setActive });
    expect(deps.startBrowser).toHaveBeenCalledWith({});
  });

  it('ios: goes straight to the browser with no package', async () => {
    const deps = makeDeps({
      platform: 'ios',
      startBrowser: jest.fn().mockResolvedValue({ createdSessionId: 'sess_4', setActive, authSessionResult: { type: 'success' } }),
    });
    await expect(runGoogleSignIn(deps)).resolves.toEqual({ kind: 'session', sessionId: 'sess_4', setActive });
    expect(deps.startNative).not.toHaveBeenCalled();
    expect(deps.getBrowsers).not.toHaveBeenCalled();
    expect(deps.startBrowser).toHaveBeenCalledWith({});
  });

  it('browser dismiss without a session fails with the not-finished message', async () => {
    const deps = makeDeps({
      platform: 'ios',
      startBrowser: jest.fn().mockResolvedValue({ createdSessionId: null, setActive, authSessionResult: { type: 'dismiss' } }),
    });
    await expect(runGoogleSignIn(deps)).resolves.toEqual({ kind: 'failed', message: NOT_FINISHED_MESSAGE });
  });

  it('browser cancel without a session fails with the not-finished message', async () => {
    const deps = makeDeps({
      platform: 'ios',
      startBrowser: jest.fn().mockResolvedValue({ createdSessionId: null, setActive, authSessionResult: { type: 'cancel' } }),
    });
    await expect(runGoogleSignIn(deps)).resolves.toEqual({ kind: 'failed', message: NOT_FINISHED_MESSAGE });
  });

  it('browser missing_requirements fails with the incomplete-account message', async () => {
    const deps = makeDeps({
      platform: 'ios',
      startBrowser: jest.fn().mockResolvedValue({
        createdSessionId: null,
        setActive,
        authSessionResult: { type: 'success' },
        signUp: { status: 'missing_requirements', missingFields: ['username'] },
      }),
    });
    await expect(runGoogleSignIn(deps)).resolves.toEqual({ kind: 'failed', message: INCOMPLETE_ACCOUNT_MESSAGE });
  });

  it('browser throw fails with the Clerk error message', async () => {
    const deps = makeDeps({
      platform: 'ios',
      startBrowser: jest.fn().mockRejectedValue({ errors: [{ longMessage: 'Boom' }] }),
    });
    await expect(runGoogleSignIn(deps)).resolves.toEqual({ kind: 'failed', message: 'Boom' });
  });
});
