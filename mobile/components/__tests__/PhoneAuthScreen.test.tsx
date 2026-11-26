import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import PhoneLogin from '@/app/(auth)/phone-login';
import { startCode } from '@/utils/codeAuth';

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
  useFocusEffect: jest.fn(),
}));
jest.mock('@clerk/expo', () => ({
  useSignIn: () => ({ signIn: {} }),
  useSignUp: () => ({ signUp: {} }),
}));
jest.mock('@/utils/codeAuth', () => ({ ...jest.requireActual('@/utils/codeAuth'), startCode: jest.fn() }));

describe('Phone sign-in screen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends the code to the normalized number and offers resend and autofill', async () => {
    (startCode as jest.Mock).mockResolvedValue({ ok: true, mode: 'signUp' });
    await render(<PhoneLogin />);
    await fireEvent.changeText(screen.getByLabelText('Phone number'), '(801) 555-1234');
    await fireEvent.press(screen.getByText('Send code'));
    await waitFor(() => expect(screen.getByLabelText('Verification code')).toBeTruthy());
    expect((startCode as jest.Mock).mock.calls[0].slice(0, 2)).toEqual(['phone', '+18015551234']);
    expect(screen.getByLabelText('Verification code').props.textContentType).toBe('oneTimeCode');
    expect(screen.getByText(/Resend in/)).toBeTruthy();
  });

  it('stays on the number step when the code cannot be sent', async () => {
    (startCode as jest.Mock).mockResolvedValue({ ok: false, message: 'Too many attempts' });
    await render(<PhoneLogin />);
    await fireEvent.changeText(screen.getByLabelText('Phone number'), '8015551234');
    await fireEvent.press(screen.getByText('Send code'));
    await waitFor(() => expect(startCode).toHaveBeenCalled());
    expect(screen.queryByLabelText('Verification code')).toBeNull();
  });
});
