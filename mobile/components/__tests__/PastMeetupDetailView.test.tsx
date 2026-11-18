import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PastMeetupDetailView } from '../PastMeetupDetailView';
import type { PastMeetupDetail } from '@/utils/api';

jest.mock('@/contexts/AppearanceContext', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#123456' }),
  useAppearance: () => ({ scheme: 'light' }),
}));

const p = (_id: string, firstName: string, extra: object = {}) => ({ _id, firstName, ...extra });
const full: PastMeetupDetail = {
  id: 'm1', name: 'Tuesday Hike', date: '2026-11-10T16:00:00.000Z', location: 'Red Rocks',
  in: [p('a', 'Ann'), p('b', 'Bo')], out: [p('c', 'Cy')], undecided: [p('d', 'Dee')], waitlist: [],
  guestsBy: [{ userId: 'a', count: 2 }],
  items: [{ name: 'Chips', by: [p('a', 'Ann'), p('b', 'Bo')] }],
  cars: [{ driver: p('a', 'Ann'), seats: 4, riders: [p('b', 'Bo')], guests: 2 }],
  needsRide: [p('d', 'Dee')],
  tournament: { id: 't1', format: 'single', mode: 'singles', status: 'finished', champion: 'Ann' },
};

describe('PastMeetupDetailView', () => {
  it('shows the name, place and who was in, out and undecided', () => {
    render(<PastMeetupDetailView detail={full} onOpenTournament={() => {}} />);
    expect(screen.getByText('Tuesday Hike')).toBeTruthy();
    expect(screen.getByText('Red Rocks')).toBeTruthy();
    expect(screen.getByText('In — 2')).toBeTruthy();
    expect(screen.getByText('Out — 1')).toBeTruthy();
    expect(screen.getByText('Undecided — 1')).toBeTruthy();
    expect(screen.getByText('Ann +2')).toBeTruthy(); // her guests
    expect(screen.queryByText(/Waitlist/)).toBeNull();
  });

  it('shows the waitlist only when someone was on it', () => {
    render(<PastMeetupDetailView detail={{ ...full, waitlist: [p('e', 'Eve')] }} onOpenTournament={() => {}} />);
    expect(screen.getByText('Waitlist — 1')).toBeTruthy();
  });

  it('shows who brought what and the cars', () => {
    render(<PastMeetupDetailView detail={full} onOpenTournament={() => {}} />);
    expect(screen.getByText('Chips')).toBeTruthy();
    expect(screen.getByText('Ann, Bo')).toBeTruthy();
    expect(screen.getByText("Ann's car")).toBeTruthy();
    expect(screen.getByText('Bo · +2 guests')).toBeTruthy();
    expect(screen.getByText('Needed a ride: Dee')).toBeTruthy();
  });

  it('hides items, rides and tournament when there are none or they were not recorded', () => {
    render(<PastMeetupDetailView detail={{ ...full, items: null, cars: [], needsRide: [], tournament: null, location: null }} onOpenTournament={() => {}} />);
    expect(screen.queryByText('Brought')).toBeNull();
    expect(screen.queryByText('Rides')).toBeNull();
    expect(screen.queryByText('Tournament')).toBeNull();
  });

  it('shows the champion and opens the results', () => {
    const onOpen = jest.fn();
    render(<PastMeetupDetailView detail={full} onOpenTournament={onOpen} />);
    expect(screen.getByText('Champion: Ann')).toBeTruthy();
    fireEvent.press(screen.getByText('See results'));
    expect(onOpen).toHaveBeenCalledWith('t1');
  });
});
