import { act, renderHook } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { useSocialAuth } from '../useSocialAuth';
import { NOT_FINISHED_MESSAGE } from '@/utils/googleSignIn';

const mockStartNative = jest.fn();
const mockStartSSO = jest.fn();
const mockGetBrowsers = jest.fn();
const mockReplace = jest.fn();

jest.mock('@clerk/expo', () => ({ useSSO: () => ({ startSSOFlow: mockStartSSO }) }));
jest.mock('@clerk/expo/google', () => ({
  useSignInWithGoogle: () => ({ startGoogleAuthenticationFlow: mockStartNative }),
}));
jest.mock('expo-web-browser', () => ({ getCustomTabsSupportingBrowsersAsync: () => mockGetBrowsers() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

describe('useSocialAuth (Android)', () => {
  const originalOS = Platform.OS;
  let alertSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetBrowsers.mockResolvedValue({ browserPackages: ['com.android.chrome'] });
  });
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
    alertSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('calls setActive with the new session and does not alert', async () => {
    const setActive = jest.fn().mockResolvedValue(undefined);
    mockStartNative.mockResolvedValue({ createdSessionId: 'sess_1', setActive });
    const { result } = await renderHook(() => useSocialAuth());
    await act(() => result.current.handleSocialAuth('oauth_google'));
    expect(setActive).toHaveBeenCalledWith({ session: 'sess_1' });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockStartSSO).not.toHaveBeenCalled();
  });

  it('alerts "Google sign-in" with the message and routes to /(auth) when sign-in fails', async () => {
    mockStartNative.mockRejectedValue(new Error('native module is not available'));
    mockStartSSO.mockResolvedValue({ createdSessionId: null, authSessionResult: { type: 'dismiss' } });
    const { result } = await renderHook(() => useSocialAuth());
    await act(() => result.current.handleSocialAuth('oauth_google'));
    expect(mockStartSSO).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      authSessionOptions: { browserPackage: 'com.android.chrome' },
    });
    expect(alertSpy).toHaveBeenCalledWith('Google sign-in', NOT_FINISHED_MESSAGE);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)');
  });

  it('does nothing visible when the native sheet is cancelled', async () => {
    mockStartNative.mockResolvedValue({ createdSessionId: null, setActive: jest.fn() });
    const { result } = await renderHook(() => useSocialAuth());
    await act(() => result.current.handleSocialAuth('oauth_google'));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockStartSSO).not.toHaveBeenCalled();
  });

  it('alerts and routes to /(auth) when setActive throws', async () => {
    const setActive = jest.fn().mockRejectedValue(new Error('boom'));
    mockStartNative.mockResolvedValue({ createdSessionId: 'sess_1', setActive });
    const { result } = await renderHook(() => useSocialAuth());
    await act(() => result.current.handleSocialAuth('oauth_google'));
    expect(alertSpy).toHaveBeenCalledWith('Google sign-in', 'Failed to sign in with Google. Please try again.');
    expect(mockReplace).toHaveBeenCalledWith('/(auth)');
  });

  it('isLoading is true during sign-in and false after', async () => {
    let finish!: (v: unknown) => void;
    mockStartNative.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { result } = await renderHook(() => useSocialAuth());
    expect(result.current.isLoading).toBe(false);
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.handleSocialAuth('oauth_google'); });
    expect(result.current.isLoading).toBe(true);
    await act(async () => { finish({ createdSessionId: null }); await pending; });
    expect(result.current.isLoading).toBe(false);
  });
});
