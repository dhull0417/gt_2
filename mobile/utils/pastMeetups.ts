import type { PastMeetupRow } from '@/utils/api';

// "8 in · 2 out · 3 undecided" for a past meetup row; zero parts are left out.
export function attendanceLine(row: Pick<PastMeetupRow, 'inCount' | 'outCount' | 'undecidedCount'>): string {
  const parts = [
    row.inCount ? `${row.inCount} in` : null,
    row.outCount ? `${row.outCount} out` : null,
    row.undecidedCount ? `${row.undecidedCount} undecided` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No RSVPs';
}
