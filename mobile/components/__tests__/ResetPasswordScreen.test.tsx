import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import ResetPasswordScreen from '@/app/(auth)/reset-password';

jest.mock('@/contexts/AppearanceContext', () => {
  const { lightColors } = jest.requireActual('@/constants/theme');
  return { useThemeColors: () => lightColors, useAppearance: () => ({ scheme: 'light' }) };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ email: 'sam@x.com' }),
  useFocusEffect: jest.fn(),
}));

const mockSignIn: any = {
  status: 'needs_first_factor',
  finalize: jest.fn(),
  resetPasswordEmailCode: {
    sendCode: jest.fn().mockResolvedValue({ error: null }),
    verifyCode: jest.fn(async () => { mockSignIn.status = 'needs_new_password'; return { error: null }; }),
    submitPassword: jest.fn()
      .mockResolvedValueOnce({ error: { errors: [{ message: 'Password is too weak' }] } })
      .mockImplementationOnce(async () => { mockSignIn.status = 'complete'; return { error: null }; }),
  },
};
jest.mock('@clerk/expo', () => ({ useSignIn: () => ({ signIn: mockSignIn }) }));

describe('Reset password', () => {
  it('lets someone retry a rejected password without re-using the code', async () => {
    await render(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '123456');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'weak');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'weak');
    await fireEvent.press(screen.getByText('Save and sign in'));
    await waitFor(() => expect(mockSignIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledTimes(1));

    await fireEvent.changeText(screen.getByLabelText('New password'), 'a much stronger one');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'a much stronger one');
    await fireEvent.press(screen.getByText('Save and sign in'));
    await waitFor(() => expect(mockSignIn.finalize).toHaveBeenCalled());
    expect(mockSignIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledTimes(1);
  });
});
