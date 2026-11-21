import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import EmailScreen from '@/app/(auth)/email';
import { startCode, lookupForPassword } from '@/utils/codeAuth';

jest.mock('@/contexts/AppearanceContext', () => {
  const { lightColors } = jest.requireActual('@/constants/theme');
  return { useThemeColors: () => lightColors, useAppearance: () => ({ scheme: 'light' }) };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock('@clerk/expo', () => ({
  useSignIn: () => ({ signIn: { status: 'needs_first_factor' } }),
  useSignUp: () => ({ signUp: { status: 'missing_requirements' } }),
}));
jest.mock('@/utils/codeAuth', () => ({
  ...jest.requireActual('@/utils/codeAuth'),
  startCode: jest.fn(),
  lookupForPassword: jest.fn(),
}));

const typeEmail = () => fireEvent.changeText(screen.getByLabelText('Email'), '  sam@x.com ');

describe('Email sign-in screen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers a code and a password', async () => {
    await render(<EmailScreen />);
    expect(screen.getByText('Continue with code')).toBeTruthy();
    expect(screen.getByText('Continue with password')).toBeTruthy();
  });

  it('sends a code to the trimmed email and shows the code step', async () => {
    (startCode as jest.Mock).mockResolvedValue({ ok: true, mode: 'signIn' });
    await render(<EmailScreen />);
    await typeEmail();
    await fireEvent.press(screen.getByText('Continue with code'));
    await waitFor(() => expect(screen.getByLabelText('Verification code')).toBeTruthy());
    expect((startCode as jest.Mock).mock.calls[0][0]).toBe('email');
    expect((startCode as jest.Mock).mock.calls[0][1]).toBe('sam@x.com');
  });

  it('shows the password field for an account that has one', async () => {
    (lookupForPassword as jest.Mock).mockResolvedValue('existing');
    await render(<EmailScreen />);
    await typeEmail();
    await fireEvent.press(screen.getByText('Continue with password'));
    await waitFor(() => expect(screen.getByLabelText('Password')).toBeTruthy());
    expect(screen.getByText('Forgot password?')).toBeTruthy();
  });

  it('asks a new account to create a password', async () => {
    (lookupForPassword as jest.Mock).mockResolvedValue('new');
    await render(<EmailScreen />);
    await typeEmail();
    await fireEvent.press(screen.getByText('Continue with password'));
    await waitFor(() => expect(screen.getByLabelText('Confirm password')).toBeTruthy());
  });

  it('explains when the account has no password and offers a code', async () => {
    (lookupForPassword as jest.Mock).mockResolvedValue('no-password');
    (startCode as jest.Mock).mockResolvedValue({ ok: true, mode: 'signIn' });
    await render(<EmailScreen />);
    await typeEmail();
    await fireEvent.press(screen.getByText('Continue with password'));
    await waitFor(() => expect(screen.getByText(/doesn't have a password/)).toBeTruthy());
    await fireEvent.press(screen.getByText('Email me a code'));
    await waitFor(() => expect(screen.getByLabelText('Verification code')).toBeTruthy());
  });
});
