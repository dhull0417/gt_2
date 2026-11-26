import { shouldPersistQuery, trimForPersist, PERSISTED_MESSAGES } from '../persistence';

const q = (queryKey: unknown[], status = 'success') => ({ queryKey, state: { status } });

describe('shouldPersistQuery', () => {
  it('saves what the app needs to open offline', () => {
    for (const k of [['currentUser'], ['groups'], ['meetups'], ['notifications'], ['groupDetails', 'g'], ['polls', 'g'], ['pins', 'g'], ['messages', 'g']]) {
      expect(shouldPersistQuery(q(k))).toBe(true);
    }
  });
  it('skips throwaway and per-session data', () => {
    for (const k of [['unreadCounts', 'sig'], ['linkPreview', 'u'], ['chatSearch', 'g'], ['groupStats', 'g']]) {
      expect(shouldPersistQuery(q(k))).toBe(false);
    }
  });
  it('never saves a failed or unfinished query', () => {
    expect(shouldPersistQuery(q(['meetups'], 'error'))).toBe(false);
    expect(shouldPersistQuery(q(['meetups'], 'pending'))).toBe(false);
  });
});

describe('trimForPersist', () => {
  const msgs = Array.from({ length: 120 }, (_, i) => ({ id: `m${i}`, created_at: new Date(2026, 0, 1, 0, i).toISOString() }));
  it('keeps only the newest messages of a chat (the list is oldest-first)', () => {
    const out = trimForPersist(['messages', 'g'], msgs) as typeof msgs;
    expect(out).toHaveLength(PERSISTED_MESSAGES);
    expect(PERSISTED_MESSAGES).toBe(50);
    expect(out[0].id).toBe('m70');
    expect(out[out.length - 1].id).toBe('m119');
  });
  it('leaves everything else alone', () => {
    const meetups = [{ _id: 'a' }];
    expect(trimForPersist(['meetups'], meetups)).toBe(meetups);
    expect(trimForPersist(['messages', 'g'], msgs.slice(0, 10))).toHaveLength(10);
  });
});
