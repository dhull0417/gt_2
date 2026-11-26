import { formatAwardValue, formatRank, AWARD_BLURBS, AWARD_KEYS } from '../statsFormat';

describe('formatAwardValue', () => {
  it('counts meetups with singular and plural', () => {
    expect(formatAwardValue('reliable', 1)).toBe('1 meetup');
    expect(formatAwardValue('reliable', 12)).toBe('12 meetups');
  });

  it('labels each award in its own words', () => {
    expect(formatAwardValue('streak', 8)).toBe('8 in a row');
    expect(formatAwardValue('responder', 20)).toBe('20 answers');
    expect(formatAwardValue('plusOne', 6)).toBe('6 guests');
    expect(formatAwardValue('chauffeur', 1)).toBe('1 seat');
    expect(formatAwardValue('snackCaptain', 5)).toBe('5 items');
    expect(formatAwardValue('chatty', 312)).toBe('312 messages');
    expect(formatAwardValue('voice', 7)).toBe('7 polls');
    expect(formatAwardValue('decliner', 9)).toBe("9 I'm Outs");
    expect(formatAwardValue('ghost', 4)).toBe('4 no-replies');
    expect(formatAwardValue('buzzer', 3)).toBe('3 last-minute');
    expect(formatAwardValue('weathervane', 5)).toBe('5 changes');
  });

  it('shows Quick Draw as an average time', () => {
    expect(formatAwardValue('quickDraw', 0)).toBe('under 1 min avg');
    expect(formatAwardValue('quickDraw', 4)).toBe('4 min avg');
    expect(formatAwardValue('quickDraw', 150)).toBe('2.5 hr avg');
    expect(formatAwardValue('quickDraw', 2880)).toBe('2 days avg');
  });

  it('shows a dash when there is no value', () => {
    expect(formatAwardValue('reliable', null)).toBe('—');
  });
});

describe('formatRank', () => {
  it('shows rank out of total, or a dash', () => {
    expect(formatRank(2, 9)).toBe('#2 of 9');
    expect(formatRank(null, 9)).toBe('—');
  });
});

it('has a blurb for every award', () => {
  expect(AWARD_KEYS).toHaveLength(13);
  for (const k of AWARD_KEYS) expect(AWARD_BLURBS[k].length).toBeGreaterThan(10);
});
