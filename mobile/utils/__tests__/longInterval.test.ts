import {
    LONG_FREQUENCIES, isLongFrequency, deriveWeekdayRule, buildLongRoutine, longDraftFromRoutine,
    describeLongRoutine, isLongDraftValid, emptyLongDraft, repeatChoiceLabels,
} from '../longInterval';

describe('deriveWeekdayRule', () => {
    it('days 1-28 give 1st-4th, 29-31 give Last', () => {
        expect(deriveWeekdayRule('2026-03-01')).toEqual({ occurrence: '1st', day: 0 });
        expect(deriveWeekdayRule('2026-11-26')).toEqual({ occurrence: '4th', day: 4 });
        expect(deriveWeekdayRule('2026-02-28')).toEqual({ occurrence: '4th', day: 6 });
        expect(deriveWeekdayRule('2026-01-29')).toEqual({ occurrence: 'Last', day: 4 });
    });
});

describe('buildLongRoutine / longDraftFromRoutine', () => {
    it('by date round-trips', () => {
        const draft = { longFirstDate: '2027-01-15', longRepeatBy: 'date' as const, longTime: '06:00 PM', longEndTime: '08:00 PM' };
        const r = buildLongRoutine('quarterly', draft);
        expect(r).toEqual({
            frequency: 'quarterly', repeatBy: 'date', rules: [],
            dayTimes: [{ startDate: '2027-01-15', date: 15, time: '06:00 PM', endTime: '08:00 PM' }],
        });
        expect(longDraftFromRoutine(r)).toEqual(draft);
    });

    it('by weekday round-trips, including a stored ISO timestamp start date', () => {
        const draft = { longFirstDate: '2026-11-26', longRepeatBy: 'weekday' as const, longTime: '04:00 PM', longEndTime: null };
        const r = buildLongRoutine('yearly', draft);
        expect(r).toEqual({
            frequency: 'yearly', repeatBy: 'weekday', rules: [{ type: 'byDay', occurrence: '4th', day: 4 }],
            dayTimes: [{ startDate: '2026-11-26', day: 4, time: '04:00 PM' }],
        });
        const stored = { ...r, dayTimes: [{ ...r.dayTimes[0], startDate: '2026-11-26T00:00:00.000Z' }] };
        expect(longDraftFromRoutine(stored)).toEqual(draft);
    });
});

describe('describeLongRoutine', () => {
    it('words each frequency and mode', () => {
        const mk = (f: any, by: 'date' | 'weekday', iso: string) => buildLongRoutine(f, { longFirstDate: iso, longRepeatBy: by, longTime: '06:00 PM', longEndTime: null });
        expect(describeLongRoutine(mk('quarterly', 'date', '2027-01-15'))).toBe('Every 3 months on the 15th');
        expect(describeLongRoutine(mk('semiannual', 'weekday', '2027-01-21'))).toBe('Every 6 months on the 3rd Thursday');
        expect(describeLongRoutine(mk('yearly', 'date', '2027-03-15'))).toBe('Yearly on March 15');
        expect(describeLongRoutine(mk('yearly', 'weekday', '2026-11-26'))).toBe('Yearly on the 4th Thursday of November');
    });

    it('repeat choice labels come from the picked date', () => {
        expect(repeatChoiceLabels('quarterly', '2027-01-21')).toEqual({ date: 'the 21st', weekday: 'the 3rd Thursday' });
        expect(repeatChoiceLabels('yearly', '2026-11-26')).toEqual({ date: 'November 26', weekday: 'the 4th Thursday of November' });
        expect(repeatChoiceLabels('yearly', null)).toBeNull();
    });
});

describe('validity and constants', () => {
    it('needs a date and a mode', () => {
        expect(isLongDraftValid(emptyLongDraft())).toBe(false);
        expect(isLongDraftValid({ ...emptyLongDraft(), longFirstDate: '2027-01-15' })).toBe(false);
        expect(isLongDraftValid({ ...emptyLongDraft(), longFirstDate: '2027-01-15', longRepeatBy: 'weekday' })).toBe(true);
    });

    it('knows the three frequencies', () => {
        expect(LONG_FREQUENCIES).toEqual(['quarterly', 'semiannual', 'yearly']);
        expect(isLongFrequency('yearly')).toBe(true);
        expect(isLongFrequency('monthly')).toBe(false);
        expect(isLongFrequency(null)).toBe(false);
    });
});
