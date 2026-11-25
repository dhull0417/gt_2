import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TourTip } from '../tour/TourTip';

jest.mock('@/contexts/AppearanceContext', () => ({
  useThemeColors: () => ({ surface: '#fff', textPrimary: '#111', textMuted: '#666', border: '#eee', brand: '#4A90E2' }),
}));

const base = { goTo: jest.fn(), pause: jest.fn(), resume: jest.fn(), previous: jest.fn() };

describe('TourTip', () => {
  it('shows the title, description and step count', async () => {
    await render(<TourTip {...base} current={1} total={6} isFirst={false} isLast={false} next={jest.fn()} stop={jest.fn()}
      title="Group Members" body="See everyone in the group." />);
    expect(screen.getByText('Group Members')).toBeTruthy();
    expect(screen.getByText('See everyone in the group.')).toBeTruthy();
    expect(screen.getByText('2 of 6')).toBeTruthy();
  });

  it('Next moves on and Skip ends the tour', async () => {
    const next = jest.fn(); const stop = jest.fn();
    await render(<TourTip {...base} current={0} total={6} isFirst isLast={false} next={next} stop={stop} title="t" body="b" />);
    await fireEvent.press(screen.getByText('Next'));
    expect(next).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Skip'));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('on the last step shows Done, which ends the tour, and no Skip', async () => {
    const next = jest.fn(); const stop = jest.fn();
    await render(<TourTip {...base} current={5} total={6} isFirst={false} isLast next={next} stop={stop} title="t" body="b" />);
    expect(screen.queryByText('Skip')).toBeNull();
    await fireEvent.press(screen.getByText('Done'));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});
