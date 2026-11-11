// Turns "before" and "after" snapshots of a meetup or a schedule into the short list of
// what changed (new values only), used for both the push text and the in-app notification.
// A field counts as changed only if the text we would show differs, so a save that resends
// every setting unchanged produces nothing.
// See docs/specs/2026-11-07-detailed-change-notifications-design.md.
import { DateTime } from 'luxon';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const IN_APP_MAX = 200;
export const PUSH_MAX = 80;

export const truncate = (text, max) => {
  const s = String(text ?? '');
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
};

const text = (v) => String(v ?? '').trim();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "06:00 PM" -> "6:00 PM" */
const clock = (t) => text(t).replace(/^0(\d:)/, '$1');
const meridiem = (t) => (/\b(AM|PM)\b/i.exec(t) || [])[1]?.toUpperCase() || '';

/** "7:00 PM" or "7:00 – 9:00 PM" (shared AM/PM written once). */
export const timeRange = (time, endTime) => {
  const start = clock(time);
  if (!endTime) return start;
  const end = clock(endTime);
  const sm = meridiem(start);
  return sm && sm === meridiem(end) ? `${start.replace(/\s*(AM|PM)$/i, '')} – ${end}` : `${start} – ${end}`;
};

const ordinalDay = (n) => {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${suffix}`;
};

/** The meetup's own date/time as shown in a notification, in the group's timezone. */
export const formatMeetupWhen = ({ date, time, endTime, timezone }, now = new Date()) => {
  const zone = timezone || 'UTC';
  const dt = DateTime.fromJSDate(new Date(date), { zone });
  const sameYear = dt.year === DateTime.fromJSDate(now, { zone }).year;
  const day = dt.toFormat(sameYear ? 'ccc, LLL d' : 'ccc, LLL d, yyyy');
  return endTime ? `${day}, ${timeRange(time, endTime)}` : `${day} at ${clock(time)}`;
};

const zoneName = (timezone, now) => {
  const long = DateTime.fromJSDate(now, { zone: timezone }).toFormat('ZZZZZ');
  return long.replace(/\s(Standard|Daylight)\s/, ' ');
};

const orderedChange = (field, label, value) => ({ field, label, value: truncate(value, IN_APP_MAX) });

/** What changed on one meetup. `before`/`after`: { date, time, endTime, timezone, location, capacity, description } */
export const meetupChanges = (before, after, { now = new Date() } = {}) => {
  const zone = after.timezone || before.timezone || 'UTC';
  const dayKey = (m) => DateTime.fromJSDate(new Date(m.date), { zone }).toISODate();
  const out = [];

  const whenChanged = dayKey(before) !== dayKey(after) || text(before.time) !== text(after.time)
    || text(before.endTime) !== text(after.endTime);
  if (whenChanged) out.push(orderedChange('when', 'When', formatMeetupWhen({ ...after, timezone: zone }, now)));

  if (text(before.location) !== text(after.location)) {
    out.push(orderedChange('location', 'Location', text(after.location) || 'Removed'));
  }
  if (Number(before.capacity || 0) !== Number(after.capacity || 0)) {
    out.push(orderedChange('capacity', 'Spots', Number(after.capacity) > 0 ? String(Number(after.capacity)) : 'No limit'));
  }
  if (text(before.description) !== text(after.description)) {
    out.push(orderedChange('description', 'Description', text(after.description) || 'Removed'));
  }
  return out;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "Every 3 months on the 15th", "Every 6 months on the 3rd Thursday",
// "Yearly on March 15", "Yearly on the 4th Thursday of November".
const longIntervalWhen = (routine, dt) => {
  const start = dt.startDate ? new Date(dt.startDate) : null; // stored as a date-only UTC midnight
  const month = start && !Number.isNaN(start.getTime()) ? MONTHS[start.getUTCMonth()] : null;
  const dayOfMonth = Number(dt.date) || (start ? start.getUTCDate() : null);
  const rule = routine.rules?.[0];
  const byWeekday = routine.repeatBy === 'weekday' && rule;
  if (routine.frequency === 'yearly') {
    if (byWeekday) return `Yearly on the ${rule.occurrence} ${DAYS[rule.day] ?? 'day'}${month ? ` of ${month}` : ''}`;
    return month ? `Yearly on ${month} ${dayOfMonth}` : 'Yearly';
  }
  const every = routine.frequency === 'quarterly' ? 'Every 3 months' : 'Every 6 months';
  if (byWeekday) return `${every} on the ${rule.occurrence} ${DAYS[rule.day] ?? 'day'}`;
  return dayOfMonth ? `${every} on the ${ordinalDay(dayOfMonth)}` : every;
};

const routineLines = (routine) => {
  const dayTimes = routine?.dayTimes || [];
  return dayTimes.map((dt, i) => {
    const at = timeRange(dt.time, dt.endTime);
    switch (routine.frequency) {
      case 'daily': return `Every day at ${at}`;
      case 'biweekly': return `Every other ${DAYS[dt.day] ?? 'day'} at ${at}`;
      case 'monthly': return `Monthly on the ${ordinalDay(Number(dt.date))} at ${at}`;
      case 'quarterly':
      case 'semiannual':
      case 'yearly': return `${longIntervalWhen(routine, dt)} at ${at}`;
      case 'ordinal': {
        const rule = routine.rules?.[i] || routine.ordinalConfig || {};
        return `${rule.occurrence || ''} ${DAYS[rule.day ?? dt.day] ?? 'day'} of the month at ${at}`.trim();
      }
      default: return `${DAYS[dt.day] ?? 'Day'}s at ${at}`;
    }
  });
};

const describeRoutines = (routines) => {
  const lines = [...new Set((routines || []).flatMap(routineLines))];
  if (lines.length <= 3) return lines.join(', ');
  return `${lines.slice(0, 3).join(', ')}, +${lines.length - 3} more`;
};

const rsvpWindow = (days, time, none) => {
  if (days === null || days === undefined) return none;
  const n = Number(days);
  return `${n === 0 ? 'Day of' : `${plural(n, 'day', 'days')} before`} at ${clock(time)}`;
};

/** What changed on a recurring schedule. Snapshots: plain schedule fields plus `timezone` (the group's). */
export const scheduleChanges = (before, after, { now = new Date() } = {}) => {
  const out = [];

  if (text(before.name) !== text(after.name)) out.push(orderedChange('name', 'Name', text(after.name)));

  const whenBefore = describeRoutines(before.routines);
  const whenAfter = describeRoutines(after.routines);
  const zoneChanged = !!before.timezone && !!after.timezone && before.timezone !== after.timezone;
  if (whenBefore !== whenAfter || zoneChanged) {
    const suffix = zoneChanged ? ` (${zoneName(after.timezone, now)})` : '';
    out.push(orderedChange('when', 'When', `${whenAfter || 'No times set'}${suffix}`));
  }

  if (text(before.defaultLocation) !== text(after.defaultLocation)) {
    out.push(orderedChange('location', 'Location', text(after.defaultLocation) || 'Removed'));
  }
  if (Number(before.defaultCapacity || 0) !== Number(after.defaultCapacity || 0)) {
    out.push(orderedChange('capacity', 'Spots', Number(after.defaultCapacity) > 0 ? String(Number(after.defaultCapacity)) : 'No limit'));
  }
  if (Number(before.defaultMinAttendees || 0) !== Number(after.defaultMinAttendees || 0)) {
    const n = Number(after.defaultMinAttendees || 0);
    out.push(orderedChange('minimum', 'Minimum', n > 0 ? plural(n, 'person', 'people') : 'Off'));
  }

  const openBefore = rsvpWindow(before.generationLeadDays, before.generationLeadTime, 'Anytime');
  const openAfter = rsvpWindow(after.generationLeadDays, after.generationLeadTime, 'Anytime');
  if (openBefore !== openAfter) out.push(orderedChange('rsvpOpen', 'RSVPs open', openAfter));

  const closeBefore = rsvpWindow(before.generationDeadlineDays, before.generationDeadlineTime, 'No deadline');
  const closeAfter = rsvpWindow(after.generationDeadlineDays, after.generationDeadlineTime, 'No deadline');
  if (closeBefore !== closeAfter) out.push(orderedChange('rsvpClose', 'RSVPs close', closeAfter));

  if (text(before.defaultDescription) !== text(after.defaultDescription)) {
    out.push(orderedChange('description', 'Description', text(after.defaultDescription) || 'Removed'));
  }
  return out;
};

/** The push body: one "Label: value" line per change, values cut to PUSH_MAX characters. */
export const pushBody = (changes) =>
  changes.map((c) => `${c.label}: ${truncate(c.value, PUSH_MAX)}`).join('\n');

/** Plain snapshot of a stored schedule (Mongoose subdocument or object) for diffing. */
export const scheduleSnapshot = (schedule, timezone) => {
  const s = typeof schedule?.toObject === 'function' ? schedule.toObject() : schedule || {};
  return {
    name: s.name,
    timezone,
    routines: JSON.parse(JSON.stringify(s.routines || [])),
    defaultLocation: s.defaultLocation,
    defaultCapacity: s.defaultCapacity,
    defaultMinAttendees: s.defaultMinAttendees,
    defaultDescription: s.defaultDescription,
    generationLeadDays: s.generationLeadDays ?? null,
    generationLeadTime: s.generationLeadTime,
    generationDeadlineDays: s.generationDeadlineDays ?? null,
    generationDeadlineTime: s.generationDeadlineTime,
  };
};
