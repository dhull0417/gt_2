import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ChoiceSheet from '../ChoiceSheet';
import TeamSplitSheet from '../TeamSplitSheet';
import PlayersSheet from '../PlayersSheet';
import RankingSheet from '../RankingSheet';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@/contexts/AppearanceContext', () => {
  const c = new Proxy({}, { get: () => '#888888' });
  return { useThemeColors: () => c, useAppearance: () => ({ scheme: 'light' }) };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));

describe('ChoiceSheet', () => {
  const options = [
    { value: 'roundRobin', label: 'Round robin', sub: 'Everyone plays everyone' },
    { value: 'double', label: 'Double elim', sub: 'Out after two losses', disabled: true, note: 'Matches of 2 only' },
  ];
  it('picking an enabled option applies it and closes', async () => {
    const onPick = jest.fn(); const onClose = jest.fn();
    await render(<ChoiceSheet visible title="Format" value="double" options={options} onPick={onPick} onClose={onClose} />);
    await fireEvent.press(screen.getByText('Round robin'));
    expect(onPick).toHaveBeenCalledWith('roundRobin');
    expect(onClose).toHaveBeenCalled();
  });
  it('a disabled option shows its note and does nothing', async () => {
    const onPick = jest.fn(); const onClose = jest.fn();
    await render(<ChoiceSheet visible title="Format" value="roundRobin" options={options} onPick={onPick} onClose={onClose} />);
    expect(screen.getByText('Matches of 2 only')).toBeTruthy();
    await fireEvent.press(screen.getByText('Double elim'));
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('TeamSplitSheet', () => {
  it('explains an uneven split and steps the value', async () => {
    const onValue = jest.fn();
    await render(<TeamSplitSheet visible onClose={() => {}} splitBy="size" value={3} totalPlayers={7} ranked={false} onSplitBy={() => {}} onValue={onValue} />);
    expect(screen.getByText(/7 players can't be split evenly into teams of 3/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('More players per team'));
    expect(onValue).toHaveBeenCalledWith(4);
  });
});

describe('PlayersSheet', () => {
  it('toggles an undecided member', async () => {
    const onToggle = jest.fn();
    await render(<PlayersSheet visible onClose={() => {}} inRows={[{ id: 'a', label: 'Ana', sub: "I'm In" }]} undecided={[{ id: 'b', label: 'Ben' }]} extra={[]} onToggle={onToggle} />);
    await fireEvent.press(screen.getByText('Ben'));
    expect(onToggle).toHaveBeenCalledWith('b');
  });
  it('hides the add section when nobody is undecided', async () => {
    await render(<PlayersSheet visible onClose={() => {}} inRows={[{ id: 'a', label: 'Ana', sub: "I'm In" }]} undecided={[]} extra={[]} onToggle={() => {}} />);
    expect(screen.queryByText("Also add (haven't answered)")).toBeNull();
  });
});

describe('RankingSheet', () => {
  const props = {
    visible: true, onClose: () => {}, on: true, onToggle: jest.fn(), mode: 'teams' as const, format: 'roundRobin' as const,
    lists: [{ _id: 'l1', name: 'Spring', order: [] }], listId: null, onPickList: jest.fn(), preview: '1. Ana', count: 5,
    onEditRanking: jest.fn(), newListName: '', onNewListName: () => {}, onSaveList: () => {}, saving: false,
    balance: true, finale: false, onBalance: () => {}, onFinale: () => {},
  };
  it('switching it on reports true', async () => {
    const onToggle = jest.fn();
    await render(<RankingSheet {...props} on={false} onToggle={onToggle} />);
    await fireEvent(screen.getByLabelText('Use a strength ranking'), 'valueChange', true);
    expect(onToggle).toHaveBeenCalledWith(true);
  });
  it('hides the ranking tools when off', async () => {
    await render(<RankingSheet {...props} on={false} />);
    expect(screen.queryByText('Spring')).toBeNull();
    expect(screen.queryByText(/Edit ranking/)).toBeNull();
  });
  it('Balance only for teams, Finale not for Just teams', async () => {
    const { rerender } = await render(<RankingSheet {...props} mode="singles" />);
    expect(screen.queryByText('Balance teams')).toBeNull();
    expect(screen.getByText('Build to a finale')).toBeTruthy();
    await rerender(<RankingSheet {...props} format="none" />);
    expect(screen.getByText('Balance teams')).toBeTruthy();
    expect(screen.queryByText('Build to a finale')).toBeNull();
  });
  it('Edit ranking calls through', async () => {
    const onEditRanking = jest.fn();
    await render(<RankingSheet {...props} onEditRanking={onEditRanking} />);
    await fireEvent.press(screen.getByText('Edit ranking (5)'));
    expect(onEditRanking).toHaveBeenCalled();
  });
});
