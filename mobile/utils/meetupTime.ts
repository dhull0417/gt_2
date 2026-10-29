import { DateTime } from 'luxon';

interface MeetupTimeFields {
  date: string;
  time: string;
  timezone?: string | null;
}

const parseClock = (time: string) => {
  const [clock, modifier] = (time || '12:00 AM').split(' ');
  let [hours, minutes] = clock.split(':').map(Number);
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return { hours: hours || 0, minutes: minutes || 0 };
};

/** The meetup's calendar day (YYYY-MM-DD) as people in the GROUP's timezone see it. */
export function meetupDayKey(m: MeetupTimeFields): string {
  const dt = DateTime.fromISO(m.date, { zone: m.timezone || undefined });
  return (dt.isValid ? dt : DateTime.fromJSDate(new Date(m.date))).toFormat('yyyy-LL-dd');
}

/** The exact moment the meetup starts, using the group's timezone (not the phone's). */
export function meetupStartInstant(m: MeetupTimeFields): Date {
  const { hours, minutes } = parseClock(m.time);
  const zone = m.timezone || undefined;
  const day = DateTime.fromISO(meetupDayKey(m), { zone });
  const start = day.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
  return (start.isValid ? start : DateTime.fromISO(m.date)).toJSDate();
}

/** A phone-local Date that shows the given YYYY-MM-DD (for pickers); never sent to the server as an instant. */
export function dayKeyToLocalDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Formats a picker's phone-local Date as the plain calendar day the server expects. */
export function localDateToDayKey(date: Date): string {
  return DateTime.fromJSDate(date).toFormat('yyyy-LL-dd');
}
