import { DateTime } from 'luxon';
import { formatAgo, formatListTime, pluralize } from '../listTime';

const now = DateTime.local(2026, 10, 19, 15, 0);

describe('listTime', () => {
  it('formats compact row times', () => {
    expect(formatListTime(now.minus({ seconds: 20 }).toISO(), now)).toBe('now');
    expect(formatListTime(now.minus({ minutes: 5 }).toISO(), now)).toBe('5m');
    expect(formatListTime(now.minus({ days: 1 }).toISO(), now)).toBe('Yesterday');
    expect(formatListTime(null, now)).toBe('');
  });

  it('formats "Reminded ... ago" text', () => {
    expect(formatAgo(now.minus({ seconds: 10 }).toISO(), now)).toBe('just now');
    expect(formatAgo(now.minus({ minutes: 45 }).toISO(), now)).toBe('45m ago');
    expect(formatAgo(now.minus({ hours: 3 }).toISO(), now)).toBe('3h ago');
    expect(formatAgo(now.minus({ days: 2 }).toISO(), now)).toBe('2d ago');
  });

  it('pluralizes', () => {
    expect(pluralize(1, 'spot')).toBe('1 spot');
    expect(pluralize(3, 'spot')).toBe('3 spots');
  });
});
