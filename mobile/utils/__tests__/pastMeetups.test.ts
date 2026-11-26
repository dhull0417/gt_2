import { attendanceLine } from '../pastMeetups';

const row = (inCount: number, outCount: number, undecidedCount: number) => ({ inCount, outCount, undecidedCount });

describe('attendanceLine', () => {
  it('lists in, out and undecided', () => {
    expect(attendanceLine(row(8, 2, 3))).toBe('8 in · 2 out · 3 undecided');
  });
  it('drops zero parts', () => {
    expect(attendanceLine(row(5, 0, 1))).toBe('5 in · 1 undecided');
    expect(attendanceLine(row(0, 4, 0))).toBe('4 out');
  });
  it('says so when nobody answered', () => {
    expect(attendanceLine(row(0, 0, 0))).toBe('No RSVPs');
  });
});
