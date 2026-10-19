import { buildFrequencyDetail, FREQUENCY_LABELS, DAY_ABBR } from '../meetupFrequency';

const m = (frequency: string | undefined, iso: string, timezone = 'America/Denver') => ({ frequency, date: iso, timezone } as any);

describe('buildFrequencyDetail', () => {
  it('weekly and biweekly show the weekday abbreviation in the meetup\'s own timezone', () => {
    // 2026-10-08T01:00Z is Wednesday 7 PM in Denver (but already Thursday in UTC)
    expect(buildFrequencyDetail(m('weekly', '2026-10-08T01:00:00Z'))).toBe('W');
    expect(buildFrequencyDetail(m('weekly', '2026-10-08T01:00:00Z', 'UTC'))).toBe('Th');
    expect(buildFrequencyDetail(m('biweekly', '2026-10-10T16:00:00Z'))).toBe('Sa');
    expect(buildFrequencyDetail(m('weekly', '2026-10-11T16:00:00Z'))).toBe('Su'); // Luxon Sunday = 7 -> 0
  });

  it('monthly shows the day of the month with a correct suffix', () => {
    expect(buildFrequencyDetail(m('monthly', '2026-10-14T01:00:00Z'))).toBe('13th day');
    expect(buildFrequencyDetail(m('monthly', '2026-10-22T18:00:00Z'))).toBe('22nd day');
    expect(buildFrequencyDetail(m('monthly', '2026-10-31T18:00:00Z'))).toBe('31st day');
  });

  it('ordinal shows the occurrence of the weekday in the month, including Last', () => {
    expect(buildFrequencyDetail(m('ordinal', '2026-10-15T01:00:00Z'))).toBe('2nd W'); // Wed Oct 14
    expect(buildFrequencyDetail(m('ordinal', '2026-10-07T18:00:00Z'))).toBe('1st W'); // Wed Oct 7
    expect(buildFrequencyDetail(m('ordinal', '2026-10-25T15:00:00Z'))).toBe('Last Su'); // Sun Oct 25
    expect(buildFrequencyDetail(m('ordinal', '2026-11-29T16:00:00Z'))).toBe('Last Su'); // Sun Nov 29
  });

  it('returns null with no frequency, an unknown one, or an invalid timezone', () => {
    expect(buildFrequencyDetail(m(undefined, '2026-10-08T01:00:00Z'))).toBeNull();
    expect(buildFrequencyDetail(m('daily', '2026-10-08T01:00:00Z'))).toBeNull();
    expect(buildFrequencyDetail(m('weekly', '2026-10-08T01:00:00Z', 'Not/AZone'))).toBeNull();
  });

  it('exposes labels and weekday abbreviations', () => {
    expect(FREQUENCY_LABELS.ordinal).toBe('Monthly');
    expect(Object.keys(DAY_ABBR)).toHaveLength(7);
  });
});
