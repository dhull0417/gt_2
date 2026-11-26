import { confirmTabsFor, shouldPromptAfterIn, tileTapAction } from '../confirmTabs';
import { MAX_ANSWER_LENGTH } from '../questions';

const base: any = {
  _id: 'm1', name: 'Hike', group: { isPremium: true },
  members: [{ _id: 'u1' }, { _id: 'u2' }, { _id: 'u3' }],
  in: ['u1'], out: ['u3'], waitlist: ['u2'], guests: [],
  bringItems: [{ _id: 'i1', name: 'Chips' }], ridesEnabled: true,
  questions: [{ _id: 'q1', prompt: 'Diet?', type: 'text', options: [], required: false }],
  bringClaims: [], rides: [], answers: [],
};

describe('confirmTabsFor', () => {
  it('orders Stuff to bring, Rides, Questions for someone In', () => {
    expect(confirmTabsFor(base, 'u1')).toEqual(['bring', 'rides', 'questions']);
  });
  it('gives the waitlist only Questions', () => {
    expect(confirmTabsFor(base, 'u2')).toEqual(['questions']);
  });
  it('skips what the meetup does not use', () => {
    expect(confirmTabsFor({ ...base, bringItems: [], questions: [] }, 'u1')).toEqual(['rides']);
  });
  it('is empty without Premium or for someone not going', () => {
    expect(confirmTabsFor({ ...base, group: { isPremium: false } }, 'u1')).toEqual([]);
    expect(confirmTabsFor(base, 'u3')).toEqual([]);
  });
});

describe('shouldPromptAfterIn', () => {
  it('prompts while nothing is picked yet', () => {
    expect(shouldPromptAfterIn(base, 'u1')).toBe(true);
  });
  it('still prompts when items are picked but questions are unanswered', () => {
    expect(shouldPromptAfterIn({ ...base, bringClaims: [{ user: 'u1', item: 'i1' }] }, 'u1')).toBe(true);
  });
  it('does not prompt once everything is picked', () => {
    const done = { ...base, rides: [{ user: 'u1', role: 'passenger' }], answers: [{ user: 'u1', question: 'q1', value: 'Vegan' }] };
    expect(shouldPromptAfterIn(done, 'u1')).toBe(false);
  });
  it('never prompts the waitlist', () => {
    expect(shouldPromptAfterIn(base, 'u2')).toBe(false);
  });
});

describe('tileTapAction', () => {
  it('opens your own picks to edit, or read-only on a past meetup', () => {
    expect(tileTapAction(base, 'u1', 'u1', false)).toBe('edit');
    expect(tileTapAction(base, 'u1', 'u1', true)).toBe('review');
  });
  it("opens someone else's picks read-only", () => {
    expect(tileTapAction(base, 'u1', 'u2', false)).toBe('review');
  });
  it('falls back to the person sheet, or nothing for yourself, when there are no picks', () => {
    expect(tileTapAction(base, 'u1', 'u3', false)).toBe('person');
    expect(tileTapAction(base, 'u3', 'u3', false)).toBe('none');
  });
});

it('caps answers at 70 characters', () => {
  expect(MAX_ANSWER_LENGTH).toBe(70);
});
