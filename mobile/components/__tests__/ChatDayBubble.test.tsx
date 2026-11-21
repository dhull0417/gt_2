import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ChatDayBubble } from '../ChatDayBubble';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: any) => children }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('@/contexts/AppearanceContext', () => ({ useAppearance: () => ({ scheme: 'light' }) }));

const flat = (s: any): any => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s || {});

describe('ChatDayBubble', () => {
  it('draws its shadow with boxShadow, not legacy shadow props (iOS warns: translucent pill)', async () => {
    await render(<ChatDayBubble label="Today" />);
    const style = flat(screen.getByTestId('day-bubble-shadow').props.style);
    expect(style.boxShadow).toBe('0px 3px 12px rgba(0, 0, 0, 0.12)');
    expect(style.shadowOpacity).toBeUndefined();
    expect(style.shadowColor).toBeUndefined();
    expect(style.elevation).toBeUndefined();
    expect(screen.getByText('Today')).toBeTruthy();
  });
});
