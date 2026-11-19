import React from 'react';
import { Modal, Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ActionSheet, type ActionSheetItem } from '../ActionSheet';

jest.mock('@/contexts/AppearanceContext', () => ({
  useThemeColors: () => ({ surface: '#fff', border: '#eee', borderStrong: '#ddd', textPrimary: '#111' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));

function makeItems(log: string[] = []): ActionSheetItem[] {
  return [
    { key: 'calendar', label: 'Add to Calendar', icon: <Text>c</Text>, iconBg: '#F0FDF4', onPress: () => log.push('calendar') },
    { key: 'chat', label: 'Go to Chat', icon: <Text>m</Text>, iconBg: '#F0F9FF', onPress: () => log.push('chat') },
    { key: 'invite', label: 'Invite to Meetup', icon: <Text>i</Text>, iconBg: '#ECFDF5', onPress: () => log.push('invite') },
  ];
}

describe('ActionSheet', () => {
  it('renders a row per item', () => {
    render(<ActionSheet visible onClose={() => {}} items={makeItems()} />);
    expect(screen.getByText('Add to Calendar')).toBeTruthy();
    expect(screen.getByText('Go to Chat')).toBeTruthy();
    expect(screen.getByText('Invite to Meetup')).toBeTruthy();
  });

  it('pressing a row closes then runs the action', () => {
    const log: string[] = [];
    render(<ActionSheet visible onClose={() => log.push('close')} items={makeItems(log)} />);
    fireEvent.press(screen.getByText('Go to Chat'));
    expect(log).toEqual(['close', 'chat']);
  });

  it('tapping the backdrop closes', () => {
    const onClose = jest.fn();
    render(<ActionSheet visible onClose={onClose} items={makeItems()} />);
    fireEvent.press(screen.getByTestId('action-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hardware back closes', () => {
    const onClose = jest.fn();
    render(<ActionSheet visible onClose={onClose} items={makeItems()} />);
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dividers only between rows', () => {
    render(<ActionSheet visible onClose={() => {}} items={makeItems()} />);
    expect(screen.queryAllByTestId('action-sheet-divider')).toHaveLength(2);
  });

  it('hidden when not visible', () => {
    render(<ActionSheet visible={false} onClose={() => {}} items={makeItems()} />);
    expect(screen.queryByText('Go to Chat')).toBeNull();
  });
});
