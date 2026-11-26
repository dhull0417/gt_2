import React from 'react';
import { Platform } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import Welcome from '@/app/(auth)/index';

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
jest.mock('@/hooks/useSocialAuth', () => ({ useSocialAuth: () => ({ handleSocialAuth: jest.fn(), isLoading: false }) }));
jest.mock('@/hooks/useAppleAuth', () => ({ useAppleAuth: () => ({ handleAppleAuth: jest.fn(), isLoading: false }) }));
jest.mock('@/utils/pendingInvite', () => ({ peekPendingInvite: jest.fn().mockResolvedValue(null) }));
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButton: () => null,
  AppleAuthenticationButtonType: { CONTINUE: 1 },
  AppleAuthenticationButtonStyle: { BLACK: 2 },
}));

describe('Welcome screen', () => {
  const original = Platform.OS;
  afterEach(() => { (Platform as any).OS = original; });

  it('keeps Phone under More options on iPhone and reveals it on tap', async () => {
    (Platform as any).OS = 'ios';
    await render(<Welcome />);
    expect(screen.queryByText('Continue with Phone')).toBeNull();
    await fireEvent.press(screen.getByText('More options'));
    expect(screen.getByText('Continue with Phone')).toBeTruthy();
    expect(screen.getByText('Fewer options')).toBeTruthy();
  });

  it('shows Phone straight away on Android, with no toggle', async () => {
    (Platform as any).OS = 'android';
    await render(<Welcome />);
    expect(screen.getByText('Continue with Phone')).toBeTruthy();
    expect(screen.queryByText('More options')).toBeNull();
  });
});
