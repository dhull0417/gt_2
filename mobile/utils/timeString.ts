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
