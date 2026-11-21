import React from 'react';
import { Text } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
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
  it('renders a row per item', async () => {
    await render(<ActionSheet visible onClose={() => {}} items={makeItems()} />);
    expect(screen.getByText('Add to Calendar')).toBeTruthy();
    expect(screen.getByText('Go to Chat')).toBeTruthy();
    expect(screen.getByText('Invite to Meetup')).toBeTruthy();
  });

  it('pressing a row closes then runs the action', async () => {
    const log: string[] = [];
    await render(<ActionSheet visible onClose={() => log.push('close')} items={makeItems(log)} />);
    await fireEvent.press(screen.getByText('Go to Chat'));
    expect(log).toEqual(['close', 'chat']);
  });

  it('tapping the backdrop closes', async () => {
    const onClose = jest.fn();
    await render(<ActionSheet visible onClose={onClose} items={makeItems()} />);
    await fireEvent.press(screen.getByTestId('action-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hardware back closes', async () => {
    const onClose = jest.fn();
    await render(<ActionSheet visible onClose={onClose} items={makeItems()} />);
    const [modal] = screen.container.queryAll((n) => n.type === 'Modal');
    await act(async () => { modal.props.onRequestClose(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dividers only between rows', async () => {
    await render(<ActionSheet visible onClose={() => {}} items={makeItems()} />);
    expect(screen.queryAllByTestId('action-sheet-divider')).toHaveLength(2);
  });

  it('hidden when not visible', async () => {
    await render(<ActionSheet visible={false} onClose={() => {}} items={makeItems()} />);
    expect(screen.queryByText('Go to Chat')).toBeNull();
  });

  it('renders a title', async () => {
    await render(<ActionSheet visible title="Riding with Sam" onClose={() => {}} items={makeItems()} />);
    expect(screen.getByText('Riding with Sam')).toBeTruthy();
  });

  it('a row without onPress does not close', async () => {
    const onClose = jest.fn();
    await render(<ActionSheet visible onClose={onClose} items={[{ key: 'r', label: 'Ana', icon: null, iconBg: '#eee' }]} />);
    await fireEvent.press(screen.getByText('Ana'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
