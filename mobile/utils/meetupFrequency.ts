// Pure helpers for describing a meetup's recurrence (used by the meetup detail screen).
import { DateTime } from 'luxon';
import type { Meetup } from './api';
import { ordSfx } from './scheduleConstants';

export const FREQUENCY_LABELS: Record<string, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Bi-Weekly',
    monthly: 'Monthly',
    ordinal: 'Monthly',
    quarterly: 'Quarterly',
    semiannual: 'Semi-annually',
    yearly: 'Yearly',
};

export const DAY_ABBR: Record<number, string> = { 0: 'Su', 1: 'M', 2: 'T', 3: 'W', 4: 'Th', 5: 'F', 6: 'Sa' };

// Short parenthetical detail for the frequency label, e.g. "W" or "13th day" or "Last W".
// Derived straight off this occurrence's own date/timezone — not the group's stored
// routine — so it can't go stale or miss when the schedule that generated it was
// since edited, deleted, or hasn't loaded into cache yet.
export const buildFrequencyDetail = (meetup: Meetup): string | null => {
    if (!meetup.frequency) return null;
    const dt = DateTime.fromJSDate(new Date(meetup.date)).setZone(meetup.timezone);
    if (!dt.isValid) return null;

    if (meetup.frequency === 'weekly' || meetup.frequency === 'biweekly') {
        return DAY_ABBR[dt.weekday % 7];
    }
    if (meetup.frequency === 'monthly') {
        return `${dt.day}${ordSfx(dt.day)} day`;
    }
    // Quarterly/semiannual/yearly: the meetup doesn't record whether its series repeats by
    // date or by weekday, so show the plain date rather than guess.
    if (meetup.frequency === 'quarterly' || meetup.frequency === 'semiannual' || meetup.frequency === 'yearly') {
        return dt.toFormat('MMM d');
    }
    if (meetup.frequency === 'ordinal') {
        const isLast = dt.day + 7 > dt.daysInMonth;
        const occurrence = isLast ? 'Last' : `${Math.ceil(dt.day / 7)}${ordSfx(Math.ceil(dt.day / 7))}`;
        return `${occurrence} ${DAY_ABBR[dt.weekday % 7]}`;
    }
    return null;
};
