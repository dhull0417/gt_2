import React from 'react';
import { Modal, Switch, Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { GroupCard, SummaryRow, SettingSheet, FieldError, OptionRow, AddButton, sheetHeight, keyboardPadding } from '..';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@/contexts/AppearanceContext', () => {
  const c = new Proxy({}, { get: (_t, k) => (k === 'danger' ? '#DC2626' : '#888888') });
  return { useThemeColors: () => c, useAppearance: () => ({ scheme: 'light' }) };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));

const flat = (s: any): any => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s || {});

describe('SummaryRow', () => {
  it('shows label and value and calls onPress', () => {
    const onPress = jest.fn();
    render(<SummaryRow label="Format" value="Round robin" onPress={onPress} />);
    expect(screen.getByText('Format')).toBeTruthy();
    fireEvent.press(screen.getByText('Round robin'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows the reason instead of the value and cannot be pressed when disabled', () => {
    const onPress = jest.fn();
    render(<SummaryRow label="Team split" value="Teams of 2" onPress={onPress} disabledReason="Teams only" />);
    expect(screen.getByText('Teams only')).toBeTruthy();
    expect(screen.queryByText('Teams of 2')).toBeNull();
    fireEvent.press(screen.getByText('Team split'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows an error in place of the value, in red, and stays tappable', () => {
    const onPress = jest.fn();
    render(<SummaryRow label="When" value="Not set" onPress={onPress} error="Pick how often" />);
    expect(screen.queryByText('Not set')).toBeNull();
    expect(flat(screen.getByText('When').props.style).color).toBe('#DC2626');
    fireEvent.press(screen.getByText('Pick how often'));
    expect(onPress).toHaveBeenCalled();
  });

  it('locked rows read Premium with a lock and still open', () => {
    const onPress = jest.fn();
    render(<SummaryRow label="Rides" value="Off" onPress={onPress} locked />);
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByTestId('row-lock')).toBeTruthy();
    fireEvent.press(screen.getByText('Rides'));
    expect(onPress).toHaveBeenCalled();
  });

  it('a right-side control replaces the value and chevron', () => {
    render(<SummaryRow label="Rides" value="Off" onPress={() => {}} right={<Switch testID="sw" value={false} />} />);
    expect(screen.getByTestId('sw')).toBeTruthy();
    expect(screen.queryByText('Off')).toBeNull();
    expect(screen.queryByTestId('row-chevron')).toBeNull();
  });
});

describe('SettingSheet', () => {
  it('renders title and children; Done closes', () => {
    const onClose = jest.fn();
    render(<SettingSheet visible title="Format" onClose={onClose}><Text>body</Text></SettingSheet>);
    expect(screen.getByText('body')).toBeTruthy();
    fireEvent.press(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when hidden', () => {
    render(<SettingSheet visible={false} title="Format" onClose={() => {}}><Text>body</Text></SettingSheet>);
    expect(screen.queryByText('Format')).toBeNull();
  });

  it('as an overlay it draws without a native Modal', () => {
    const onClose = jest.fn();
    render(<SettingSheet visible asOverlay title="When" onClose={onClose}><Text>body</Text></SettingSheet>);
    expect(screen.UNSAFE_queryByType(Modal)).toBeNull();
    fireEvent.press(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('SettingSheet height', () => {
  it('a tall sheet keeps a fixed height so it does not jump as its content changes', () => {
    const { Dimensions } = require('react-native');
    const h = Dimensions.get('window').height;
    render(<SettingSheet visible tall title="When" onClose={() => {}}><Text>body</Text></SettingSheet>);
    expect(flat(screen.getByTestId('sheet-panel').props.style).height).toBe(Math.round(h * 0.88));
  });
});

describe('SettingSheet touches', () => {
  it('the panel holding the scroll list does not grab touches, so scrolling is never fought over', () => {
    render(<SettingSheet visible tall title="When" onClose={() => {}}><Text>body</Text></SettingSheet>);
    const panel = screen.getByTestId('sheet-panel');
    expect(panel.props.onStartShouldSetResponder).toBeUndefined();
    expect(panel.props.onResponderGrant).toBeUndefined();
  });
  it('tapping the dimmed area behind the sheet closes it', () => {
    const onClose = jest.fn();
    render(<SettingSheet visible title="When" onClose={onClose}><Text>body</Text></SettingSheet>);
    fireEvent.press(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('sheetHeight', () => {
  it('a tall sheet shrinks to fit above the keyboard instead of being pushed off the top', () => {
    expect(sheetHeight({ window: 800, keyboard: 0, topInset: 40, tall: true })).toEqual({ height: 704 });
    expect(sheetHeight({ window: 800, keyboard: 300, topInset: 40, tall: true })).toEqual({ height: 448 });
  });
  it('a regular sheet caps its max height the same way', () => {
    expect(sheetHeight({ window: 800, keyboard: 0, topInset: 40, tall: false })).toEqual({ maxHeight: 704 });
    expect(sheetHeight({ window: 800, keyboard: 300, topInset: 40, tall: false })).toEqual({ maxHeight: 448 });
  });
});

describe('keyboardPadding', () => {
  it('lifts the sheet only when the screen did not already shrink for the keyboard', () => {
    expect(keyboardPadding({ keyboard: 300, base: 800, now: 800 })).toBe(300);
    expect(keyboardPadding({ keyboard: 300, base: 800, now: 500 })).toBe(0);
    expect(keyboardPadding({ keyboard: 0, base: 800, now: 800 })).toBe(0);
  });
});

describe('AddButton', () => {
  it('is a wide, filled button', () => {
    const onPress = jest.fn();
    render(<AddButton label="Add a day" onPress={onPress} />);
    expect(flat(screen.getByTestId('add-button').props.style).alignSelf).toBe('stretch');
    fireEvent.press(screen.getByText('Add a day'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('GroupCard', () => {
  it('puts a divider between children, skipping empty ones', () => {
    render(<GroupCard><Text>a</Text>{null}<Text>b</Text><Text>c</Text></GroupCard>);
    expect(screen.getAllByTestId('group-divider')).toHaveLength(2);
  });
});

describe('FieldError / OptionRow', () => {
  it('FieldError renders its message, nothing when empty', () => {
    const { rerender } = render(<FieldError message="Add a day" />);
    expect(screen.getByText('Add a day')).toBeTruthy();
    rerender(<FieldError message={null} />);
    expect(screen.queryByText('Add a day')).toBeNull();
  });
  it('OptionRow calls onPress', () => {
    const onPress = jest.fn();
    render(<OptionRow label="Weekly" selected={false} onPress={onPress} />);
    fireEvent.press(screen.getByText('Weekly'));
    expect(onPress).toHaveBeenCalled();
  });
});
