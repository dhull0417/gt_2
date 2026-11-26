import { toE164US } from '../phone';

describe('toE164US', () => {
  it('adds +1 to a 10-digit US number', () => {
    expect(toE164US('8015551234')).toBe('+18015551234');
  });
  it('strips punctuation and spaces', () => {
    expect(toE164US('(801) 555-1234')).toBe('+18015551234');
  });
  it('handles a leading 1 without +', () => {
    expect(toE164US('1 801 555 1234')).toBe('+18015551234');
  });
  it('keeps an international number that starts with +', () => {
    expect(toE164US('+44 20 7946 0958')).toBe('+442079460958');
  });
  it('returns empty for empty input', () => {
    expect(toE164US('')).toBe('');
    expect(toE164US('   ')).toBe('');
  });
});
