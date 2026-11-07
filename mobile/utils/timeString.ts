// Converts between app's "hh:mm AM/PM" strings and Date objects for the native picker.
export const timeStringToDate = (time: string): Date => {
    const [t, period] = time.split(' ');
    let [h, m] = t.split(':').map(Number);
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
};

export const dateToTimeString = (date: Date): string => {
    let h = date.getHours();
    const m = date.getMinutes();
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
};

// ─── Optional end time ─────────────────────────────────────────────────────────
// An end earlier than the start means the next day (9:00 PM – 1:00 AM).

const clockMinutes = (time: string): number => {
    const d = timeStringToDate(time);
    return d.getHours() * 60 + d.getMinutes();
};

/**
 * "05:00 PM – 08:00 PM", or "05:00 PM" without an end time. For schedule rows (the group's own
 * clock), in the same "hh:mm AM/PM" style those screens already show start times in.
 * Meetups use formatMeetupTimeRange (utils/meetupTime) instead, which converts to the viewer's zone.
 */
export const formatTimeRange = (time: string, endTime?: string | null): string =>
    endTime ? `${time} – ${endTime}` : time;

/** Same rule the server enforces; null when fine or when there is no end time. */
export const endTimeError = (time: string, endTime?: string | null): string | null => {
    if (!endTime) return null;
    return clockMinutes(time) === clockMinutes(endTime) ? "End time can't be the same as the start time." : null;
};

/** Start + 1 hour, where the end-time picker opens when no end time is set yet. */
export const addHour = (time: string): string => {
    const d = timeStringToDate(time);
    d.setHours(d.getHours() + 1);
    return dateToTimeString(d);
};
