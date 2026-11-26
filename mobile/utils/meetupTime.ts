import { DateTime } from 'luxon';
import { deviceTimeZone, tzAbbr } from './timezones';

interface MeetupTimeFields {
  date: string;
  time: string;
  timezone?: string | null;
  /** Optional end time ("08:00 PM") and the exact moment it ends (server-computed). */
  endTime?: string | null;
  endsAt?: string | null;
}

/** A meetup without an end time is treated as lasting this long. */
export const DEFAULT_MEETUP_DURATION_MS = 60 * 60 * 1000;

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

/**
 * When the meetup ends: its endsAt; else its end clock time (next day when not after the start);
 * else start + 1 hour. Mirrors effectiveEnd in backend/src/utils/meetupEndTime.js.
 */
export function meetupEndInstant(m: MeetupTimeFields): Date {
  if (m.endsAt) return new Date(m.endsAt);
  const start = meetupStartInstant(m);
  if (!m.endTime) return new Date(start.getTime() + DEFAULT_MEETUP_DURATION_MS);
  const startDT = DateTime.fromJSDate(start).setZone(m.timezone || 'local');
  const { hours, minutes } = parseClock(m.endTime);
  let end = startDT.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
  if (end <= startDT) end = end.plus({ days: 1 });
  return end.toJSDate();
}

/** The timezone meetup times are shown in: the phone's own. */
export const viewerZone = (): string => deviceTimeZone();

// The start moment as seen in `zone`. A meetup without a timezone is read as being in the viewer's zone.
const startIn = (m: MeetupTimeFields, zone: string) =>
  DateTime.fromJSDate(meetupStartInstant({ ...m, timezone: m.timezone || zone })).setZone(zone);

/** The meetup's calendar day (YYYY-MM-DD) for the viewer: a late meetup can fall on their next day. */
export function meetupViewerDayKey(m: MeetupTimeFields, zone: string = viewerZone()): string {
  return startIn(m, zone).toFormat('yyyy-LL-dd');
}

/**
 * Start time in the viewer's timezone: "9:00 PM ET" for someone in Eastern looking at a 7:00 PM Mountain
 * meetup. The zone label only appears when the viewer's clock differs from the group's at that moment.
 */
export function formatMeetupTime(m: MeetupTimeFields, zone: string = viewerZone()): string {
  const local = startIn(m, zone);
  return local.toFormat('h:mm a') + zoneSuffix(local.toJSDate(), m.timezone, zone);
}

/**
 * "5:00 PM – 8:00 PM" in the viewer's timezone (zone label once, at the end, as formatMeetupTime).
 * Without an end time it is just formatMeetupTime.
 */
export function formatMeetupTimeRange(m: MeetupTimeFields, zone: string = viewerZone()): string {
  if (!m.endTime && !m.endsAt) return formatMeetupTime(m, zone);
  const local = startIn(m, zone);
  const end = DateTime.fromJSDate(meetupEndInstant(m)).setZone(zone);
  return `${local.toFormat('h:mm a')} – ${end.toFormat('h:mm a')}` + zoneSuffix(local.toJSDate(), m.timezone, zone);
}

/** Any moment (e.g. when RSVPs open) as a clock time for the viewer, labelled like formatMeetupTime. */
export function formatInstantTime(instant: Date | string, groupZone: string | null | undefined, zone: string = viewerZone()): string {
  const local = DateTime.fromJSDate(new Date(instant)).setZone(zone);
  return local.toFormat('h:mm a') + zoneSuffix(local.toJSDate(), groupZone, zone);
}

// " ET" when the viewer's clock differs from the group's at that moment, otherwise nothing.
function zoneSuffix(instant: Date, groupZone: string | null | undefined, zone: string): string {
  if (!groupZone) return '';
  const at = DateTime.fromJSDate(instant);
  return at.setZone(groupZone).offset === at.setZone(zone).offset ? '' : ` ${tzAbbr(zone)}`;
}

/** The meetup's date formatted for the viewer (their day, not necessarily the group's). */
export function formatMeetupDate(m: MeetupTimeFields, opts: Intl.DateTimeFormatOptions, zone: string = viewerZone()): string {
  return startIn(m, zone).toJSDate().toLocaleDateString(undefined, { ...opts, timeZone: zone });
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
