import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SquircleTile } from '../ui/SquircleTile';

jest.mock('@/contexts/AppearanceContext', () => ({
  useThemeColors: () => ({ surface: '#fff', textPrimary: '#111', textMuted: '#666', border: '#eee' }),
}));

const tint = { bg: '#EEF6FF', border: '#BFDBFE', fg: '#4A90E2' };

describe('SquircleTile', () => {
  it('shows the label and subtitle', async () => {
    await render(<SquircleTile icon="users" label="Group Members" subtitle="14 members" tint={tint} onPress={() => {}} />);
    expect(screen.getByText('Group Members')).toBeTruthy();
    expect(screen.getByText('14 members')).toBeTruthy();
  });

  it('is a square with continuous (squircle) corners', async () => {
    await render(<SquircleTile icon="users" label="Members" tint={tint} onPress={() => {}} testID="tile" />);
    const style = StyleSheet.flatten(screen.getByTestId('tile').props.style);
    expect(style.borderCurve).toBe('continuous');
    expect(style.borderRadius).toBe(28);
    expect(style.aspectRatio).toBe(1);
  });

  it('takes its fill and border from the tint, with no separate icon box', async () => {
    await render(<SquircleTile icon="users" label="Members" tint={tint} onPress={() => {}} testID="tile" />);
    const style = StyleSheet.flatten(screen.getByTestId('tile').props.style);
    expect(style.backgroundColor).toBe('#EEF6FF');
    expect(style.borderColor).toBe('#BFDBFE');
    expect(style.borderWidth).toBe(1);
    expect(screen.queryByTestId('tile-icon-chip')).toBeNull();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<SquircleTile icon="users" label="Members" tint={tint} onPress={onPress} />);
    await fireEvent.press(screen.getByText('Members'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
