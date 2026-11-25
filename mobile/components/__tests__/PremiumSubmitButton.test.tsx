import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PremiumSubmitButton } from '../PremiumSubmitButton';
import { PremiumPreviewNote } from '../schedule/PremiumPreviewNote';
import { PremiumHighlight } from '../schedule/PremiumHighlight';
import { Text } from 'react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/contexts/AppearanceContext', () => {
  const { lightColors } = jest.requireActual('@/constants/theme');
  return { useThemeColors: () => lightColors, useAppearance: () => ({ scheme: 'light' }) };
});

describe('PremiumSubmitButton', () => {
  beforeEach(() => mockPush.mockClear());

  it('upgrade: says Premium and opens the paywall', async () => {
    await render(<PremiumSubmitButton mode="upgrade" />);
    expect(screen.getByText('Premium')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Premium'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/paywall');
  });

  it('ownerNeeds: says Owner needs Premium, is disabled and does nothing', async () => {
    await render(<PremiumSubmitButton mode="ownerNeeds" />);
    expect(screen.getByText('Owner needs Premium')).toBeTruthy();
    const btn = screen.getByLabelText('Owner needs Premium');
    expect(btn.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(btn);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('PremiumPreviewNote', () => {
  it('shows the one-line note', async () => {
    await render(<PremiumPreviewNote />);
    expect(screen.getByText('Set these up now. Premium is needed to save them.')).toBeTruthy();
  });
});

describe('PremiumHighlight', () => {
  it('adds the crown tab when active', async () => {
    await render(<PremiumHighlight active><Text>Rides</Text></PremiumHighlight>);
    expect(screen.getByText('Rides')).toBeTruthy();
    expect(screen.getByTestId('premium-crown')).toBeTruthy();
  });
  it('renders the row plainly when inactive', async () => {
    await render(<PremiumHighlight active={false}><Text>Rides</Text></PremiumHighlight>);
    expect(screen.getByText('Rides')).toBeTruthy();
    expect(screen.queryByTestId('premium-crown')).toBeNull();
  });
});
