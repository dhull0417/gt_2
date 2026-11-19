import { encodePendingAppleName, decodePendingAppleName, pendingNameFor } from '../pendingAppleName';

describe('pending Apple name', () => {
  const stash = { appleUserId: 'apple.123', firstName: 'Sam', lastName: 'Lee' };

  it('round-trips through storage', () => {
    expect(decodePendingAppleName(encodePendingAppleName(stash))).toEqual(stash);
  });

  it('ignores missing or corrupt storage', () => {
    expect(decodePendingAppleName(null)).toBeNull();
    expect(decodePendingAppleName('not json')).toBeNull();
    expect(decodePendingAppleName(JSON.stringify({ firstName: 'Sam' }))).toBeNull();
    expect(decodePendingAppleName(JSON.stringify({ appleUserId: 'a', firstName: '', lastName: ' ' }))).toBeNull();
  });

  it('gives the name only to the Apple account it came from', () => {
    expect(pendingNameFor(stash, ['apple.123'])).toEqual({ firstName: 'Sam', lastName: 'Lee' });
    expect(pendingNameFor(stash, ['apple.999'])).toBeNull();
    expect(pendingNameFor(stash, [])).toBeNull();
    expect(pendingNameFor(null, ['apple.123'])).toBeNull();
  });
});
