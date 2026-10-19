import { applyMention, extractMentions, filterMembers, findActiveMention, splitMentions } from '../chatMentions';

const members = [
  { clerkId: 'u1', name: 'Sam Rivera' },
  { clerkId: 'u2', name: 'Samantha Cole' },
  { clerkId: 'u3', name: 'Alex Kim' },
];

describe('findActiveMention', () => {
  it('finds an @ at the start or after whitespace', () => {
    expect(findActiveMention('@sa', 3)).toEqual({ start: 0, query: 'sa' });
    expect(findActiveMention('hey @al', 7)).toEqual({ start: 4, query: 'al' });
    expect(findActiveMention('hey @', 5)).toEqual({ start: 4, query: '' });
  });
  it('ignores emails and finished mentions elsewhere', () => {
    expect(findActiveMention('me@example.com', 14)).toBeNull();
    expect(findActiveMention('no at here', 10)).toBeNull();
  });
  it('only looks left of the cursor', () => {
    expect(findActiveMention('hi @al there', 6)).toEqual({ start: 3, query: 'al' });
  });
  it('gives up on a runaway query', () => {
    expect(findActiveMention('@' + 'x'.repeat(40), 41)).toBeNull();
    expect(findActiveMention('@a\nb', 4)).toBeNull();
  });
});

describe('filterMembers', () => {
  it('matches the start of the name or of any word', () => {
    expect(filterMembers(members, 'sam').map((m) => m.clerkId)).toEqual(['u1', 'u2']);
    expect(filterMembers(members, 'kim').map((m) => m.clerkId)).toEqual(['u3']);
    expect(filterMembers(members, 'zzz')).toEqual([]);
  });
  it('returns everyone (limited) for an empty query', () => {
    expect(filterMembers(members, '', 2)).toHaveLength(2);
  });
});

describe('applyMention', () => {
  it('replaces the typed query and moves the cursor after the name', () => {
    const text = 'hey @sa how are you';
    const active = findActiveMention(text, 7)!;
    const r = applyMention(text, active, 7, 'Sam Rivera');
    expect(r.text).toBe('hey @Sam Rivera  how are you');
    expect(r.cursor).toBe('hey @Sam Rivera '.length);
  });
});

describe('extractMentions', () => {
  it('returns ids of picked members still present', () => {
    expect(extractMentions('hi @Sam Rivera and @Alex Kim!', members)).toEqual(['u1', 'u3']);
  });
  it('drops a mention that was edited away', () => {
    expect(extractMentions('hi @Sam Riv', members)).toEqual([]);
  });
  it('does not confuse a name that is a prefix of another', () => {
    const pickedShort = [{ clerkId: 'u9', name: 'Sam' }];
    expect(extractMentions('hello @Samantha', pickedShort)).toEqual([]);
    expect(extractMentions('hello @Sam, hi', pickedShort)).toEqual(['u9']);
  });
  it('requires the @ to follow whitespace', () => {
    expect(extractMentions('x@Alex Kim', members)).toEqual([]);
  });
});

describe('splitMentions', () => {
  it('splits plain text and mentions', () => {
    expect(splitMentions('hi @Sam Rivera, lunch?', ['Sam Rivera'])).toEqual([
      { text: 'hi ' },
      { text: '@Sam Rivera', mention: 'Sam Rivera' },
      { text: ', lunch?' },
    ]);
  });
  it('prefers the longest matching name', () => {
    const segs = splitMentions('@Samantha Cole hi', ['Sam', 'Samantha Cole']);
    expect(segs[0]).toEqual({ text: '@Samantha Cole', mention: 'Samantha Cole' });
  });
  it('returns the whole text when nothing matches', () => {
    expect(splitMentions('nothing here', ['Sam'])).toEqual([{ text: 'nothing here' }]);
    expect(splitMentions('x', [])).toEqual([{ text: 'x' }]);
  });
  it('handles regex characters in names', () => {
    expect(splitMentions('@A.B (x)', ['A.B (x)'])).toEqual([{ text: '@A.B (x)', mention: 'A.B (x)' }]);
  });
});
