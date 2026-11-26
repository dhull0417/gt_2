import { floatingDayLabel } from '../chatFloatingDay';

// What the SectionList reports as on screen, top to bottom: day headers/footers come through with
// index null and the section as their item; messages carry their index within the section.
const day = (key: string) => ({ key, title: `Day ${key}` });
const D1 = day('1');
const D2 = day('2');
const header = (section: { key: string; title: string }) => ({ index: null, section });
const footer = header; // indistinguishable from a header on its own; order tells them apart
const msg = (section: { key: string; title: string }, index: number) => ({ index, section });

describe('floatingDayLabel', () => {
  it('shows the day of the top message once its own date bubble has scrolled away', () => {
    expect(floatingDayLabel([msg(D1, 4), msg(D1, 5), msg(D1, 6)])).toBe('Day 1');
  });

  it('hides while the top day\'s own date bubble is still on screen (no double bubble)', () => {
    expect(floatingDayLabel([header(D1), msg(D1, 0), msg(D1, 1)])).toBeNull();
  });

  it('keeps showing the earlier day while the next day\'s bubble is lower on screen', () => {
    expect(floatingDayLabel([msg(D1, 8), msg(D1, 9), footer(D1), header(D2), msg(D2, 0)])).toBe('Day 1');
  });

  it('switches to the next day once its messages reach the top', () => {
    expect(floatingDayLabel([msg(D2, 3), msg(D2, 4)])).toBe('Day 2');
  });

  it('hides when the previous day ended just above and the new day bubble sits at the top', () => {
    expect(floatingDayLabel([footer(D1), header(D2), msg(D2, 0)])).toBeNull();
  });

  it('hides when nothing is on screen', () => {
    expect(floatingDayLabel([])).toBeNull();
    expect(floatingDayLabel([header(D1)])).toBeNull();
  });
});
