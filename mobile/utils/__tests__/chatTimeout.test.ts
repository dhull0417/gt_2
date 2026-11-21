import {
  TIMEOUT_OPTIONS, isTimeoutActive, formatTimeoutRemaining, formatTimeoutEnd, isTimedOutError, canTimeOut, canModDeleteFrom,
} from '../chatTimeout';

const NOW = Date.parse('2026-11-16T15:00:00Z');
const inMs = (ms: number) => new Date(NOW + ms).toISOString();
const M = 60_000;
const H = 60 * M;
const D = 24 * H;

describe('TIMEOUT_OPTIONS', () => {
  it('lists the nine lengths in order', () => {
    expect(TIMEOUT_OPTIONS.map((o) => o.key)).toEqual(['5m', '15m', '30m', '1h', '2h', '12h', '1d', '1w', 'indefinite']);
    expect(TIMEOUT_OPTIONS.map((o) => o.label)).toEqual([
      '5 minutes', '15 minutes', '30 minutes', '1 hour', '2 hours', '12 hours', '1 day', '1 week', 'Indefinitely',
    ]);
  });
});

describe('formatTimeoutRemaining', () => {
  it('shows days only when a day or more is left', () => {
    expect(formatTimeoutRemaining(inMs(3 * D + 2 * H), NOW)).toBe('You are timed out for 3 days');
    expect(formatTimeoutRemaining(inMs(7 * D), NOW)).toBe('You are timed out for 7 days');
    expect(formatTimeoutRemaining(inMs(D), NOW)).toBe('You are timed out for 1 day');
  });
  it('shows hours only under a day', () => {
    expect(formatTimeoutRemaining(inMs(23 * H + 59 * M), NOW)).toBe('You are timed out for 23 hours');
    expect(formatTimeoutRemaining(inMs(H + 59 * M), NOW)).toBe('You are timed out for 1 hour');
    expect(formatTimeoutRemaining(inMs(H), NOW)).toBe('You are timed out for 1 hour');
  });
  it('shows minutes only under an hour, never 0', () => {
    expect(formatTimeoutRemaining(inMs(59 * M + 1000), NOW)).toBe('You are timed out for 59 minutes');
    expect(formatTimeoutRemaining(inMs(12 * M), NOW)).toBe('You are timed out for 12 minutes');
    expect(formatTimeoutRemaining(inMs(20_000), NOW)).toBe('You are timed out for 1 minute');
  });
  it('indefinite', () => {
    expect(formatTimeoutRemaining(null, NOW)).toBe('You are timed out Indefinitely');
  });
});

describe('isTimeoutActive', () => {
  it('handles missing, past, future and indefinite', () => {
    expect(isTimeoutActive(null, NOW)).toBe(false);
    expect(isTimeoutActive(undefined, NOW)).toBe(false);
    expect(isTimeoutActive({ until: inMs(-1000) }, NOW)).toBe(false);
    expect(isTimeoutActive({ until: inMs(0) }, NOW)).toBe(false);
    expect(isTimeoutActive({ until: inMs(1000) }, NOW)).toBe(true);
    expect(isTimeoutActive({ until: null }, NOW)).toBe(true);
  });
});

describe('formatTimeoutEnd', () => {
  const zone = 'America/Denver';
  const now = new Date('2026-11-16T15:00:00Z'); // Mon 8:00 AM in Denver
  it('indefinite', () => expect(formatTimeoutEnd(null, now, zone)).toBe('Indefinitely'));
  it('later today', () => expect(formatTimeoutEnd('2026-11-16T22:15:00Z', now, zone)).toBe('until 3:15 PM'));
  it('within a week', () => expect(formatTimeoutEnd('2026-11-17T22:15:00Z', now, zone)).toBe('until Tue 3:15 PM'));
  it('further out', () => expect(formatTimeoutEnd('2026-11-30T22:15:00Z', now, zone)).toBe('until Nov 30'));
});

describe('isTimedOutError', () => {
  it('matches the database refusal only', () => {
    expect(isTimedOutError(new Error('timed out'))).toBe(true);
    expect(isTimedOutError({ message: 'timed out', code: 'P0001' })).toBe(true);
    expect(isTimedOutError(new Error('Network request failed'))).toBe(false);
    expect(isTimedOutError(new Error('request timed out after 10s'))).toBe(false);
    expect(isTimedOutError(null)).toBe(false);
  });
});

describe('canTimeOut', () => {
  const group = { owner: 'o', moderators: [{ _id: 'm1' }, 'm2'], isDM: false };
  it('owner can time out moderators and members', () => {
    expect(canTimeOut('o', 'm1', group)).toBe(true);
    expect(canTimeOut('o', 'a', group)).toBe(true);
  });
  it('moderators only regular members', () => {
    expect(canTimeOut('m1', 'a', group)).toBe(true);
    expect(canTimeOut('m1', 'm2', group)).toBe(false);
    expect(canTimeOut('m1', 'o', group)).toBe(false);
  });
  it('never self, members never, no DMs', () => {
    expect(canTimeOut('o', 'o', group)).toBe(false);
    expect(canTimeOut('a', 'b', group)).toBe(false);
    expect(canTimeOut('o', 'a', { ...group, isDM: true })).toBe(false);
    expect(canTimeOut(undefined, 'a', group)).toBe(false);
  });
});

describe('canModDeleteFrom', () => {
  const group = { owner: 'o', moderators: [{ _id: 'm1' }, 'm2'], isDM: false };
  it('owner can delete moderators\' and members\' messages', () => {
    expect(canModDeleteFrom('o', 'm1', group)).toBe(true);
    expect(canModDeleteFrom('o', 'a', group)).toBe(true);
  });
  it('moderators only regular members\' messages', () => {
    expect(canModDeleteFrom('m1', 'a', group)).toBe(true);
    expect(canModDeleteFrom('m1', 'm2', group)).toBe(false);
    expect(canModDeleteFrom('m1', 'o', group)).toBe(false);
  });
  it('a sender no longer in the group counts as a regular member', () => {
    expect(canModDeleteFrom('m1', undefined, group)).toBe(true);
  });
  it('members never, no DMs, not signed in never', () => {
    expect(canModDeleteFrom('a', 'b', group)).toBe(false);
    expect(canModDeleteFrom('o', 'a', { ...group, isDM: true })).toBe(false);
    expect(canModDeleteFrom(undefined, 'a', group)).toBe(false);
  });
});

describe('timeoutNoticeLength (Notifications screen)', () => {
  const { timeoutNoticeLength } = require('../chatTimeout');
  it('names the length that was picked', () => {
    expect(timeoutNoticeLength('1h')).toBe('for 1 hour');
    expect(timeoutNoticeLength('1w')).toBe('for 1 week');
    expect(timeoutNoticeLength('indefinite')).toBe('until a moderator lifts it');
  });
  it('stays sensible when the length is missing or unknown', () => {
    expect(timeoutNoticeLength(undefined)).toBe('for a while');
    expect(timeoutNoticeLength('2d')).toBe('for a while');
  });
});
