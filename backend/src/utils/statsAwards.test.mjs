import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AWARDS, rankBy, memberMetrics, computeAwards } from './statsAwards.js';

// Events are newest first, like loadEvents returns them.
const day = (n) => new Date(Date.UTC(2026, 0, n, 18));
const ev = (n, { members = [], inn = [], out = [], ...rest } = {}) => ({
  id: `e${n}`, name: 'M', date: day(n), members, in: inn, out, capacity: 0, guests: 0,
  rsvpLog: null, rsvpOpenDate: null, rsvpCloseDate: null, tierOpens: [], guestsBy: null, itemsBy: null, seatsBy: null,
  ...rest,
});
const newestFirst = (events) => [...events].sort((a, b) => b.date - a.date);
const noExtras = { chat: null, polls: new Map(), eventsWith: { log: 0, perPerson: 0 } };
const award = (awards, key) => awards.find((a) => a.key === key);

test('AWARDS lists the 13 keys in order', () => {
  assert.deepEqual(AWARDS.map((a) => a.key), ['reliable', 'streak', 'responder', 'quickDraw', 'plusOne', 'chauffeur',
    'snackCaptain', 'chatty', 'voice', 'decliner', 'ghost', 'buzzer', 'weathervane']);
  assert.deepEqual(AWARDS.filter((a) => a.joke).map((a) => a.key), ['decliner', 'ghost', 'buzzer', 'weathervane']);
  assert.equal(AWARDS.find((a) => a.key === 'reliable').title, "Ol' Reliable");
  assert.equal(AWARDS.find((a) => a.key === 'chatty').title, 'Chatty Cathy');
});

test('rankBy ties share rank', () => {
  const r = rankBy([{ id: 'a', value: 5 }, { id: 'b', value: 3 }, { id: 'c', value: 5 }]);
  assert.deepEqual(r.map((x) => [x.id, x.rank]), [['a', 1], ['c', 1], ['b', 3]]);
});

test('rankBy drops zero and below min', () => {
  const r = rankBy([{ id: 'a', value: 0 }, { id: 'b', value: 9 }, { id: 'c', value: 12 }], { min: 10 });
  assert.deepEqual(r.map((x) => x.id), ['c']);
});

test('rankBy lower is better keeps zero', () => {
  const r = rankBy([{ id: 'a', value: 5 }, { id: 'b', value: 0 }, { id: 'c', value: null }], { lowerIsBetter: true });
  assert.deepEqual(r.map((x) => [x.id, x.rank]), [['b', 1], ['a', 2]]);
});

test('reliable winner is most attended, needs 3 eligible', () => {
  const events = newestFirst([
    ev(1, { members: ['a', 'b'], inn: ['a', 'b'] }),
    ev(2, { members: ['a', 'b'], inn: ['a', 'b'] }),
    ev(3, { members: ['a'], inn: ['a'] }),
    ev(4, { members: ['a', 'c'], inn: ['c'] }),
  ]);
  const m = memberMetrics(events, ['a', 'b', 'c']);
  assert.equal(m.get('a').eligible, 4);
  assert.equal(m.get('b').eligible, 2);
  const r = award(computeAwards(m, noExtras), 'reliable');
  assert.deepEqual(r.ranking.map((x) => [x.id, x.value, x.rank]), [['a', 3, 1]]);
});

test('reliable ties are broken by rate in order but share rank', () => {
  const events = newestFirst([1, 2, 3, 4].map((n) => ev(n, { members: ['a', 'b'], inn: n <= 3 ? ['a', 'b'] : [] })));
  events.push(ev(0, { members: ['a'] })); // a has a 5th eligible meetup, so a lower rate
  const m = memberMetrics(newestFirst(events), ['a', 'b']);
  const r = award(computeAwards(m, noExtras), 'reliable');
  assert.deepEqual(r.ranking.map((x) => [x.id, x.rank]), [['b', 1], ['a', 1]]);
});

test('bestStreak finds longest run in chronological order', () => {
  const pattern = ['in', 'in', 'out', 'in', 'in', 'in']; // oldest to newest
  const events = newestFirst(pattern.map((p, i) => ev(i + 1, { members: ['a'], inn: p === 'in' ? ['a'] : [], out: p === 'out' ? ['a'] : [] })));
  const m = memberMetrics(events, ['a']).get('a');
  assert.equal(m.bestStreak, 3);
  assert.equal(m.currentStreak, 3);
  const older = newestFirst(['in', 'in', 'in', 'in', 'out', 'in'].map((p, i) => ev(i + 1, { members: ['a'], inn: p === 'in' ? ['a'] : [], out: p === 'out' ? ['a'] : [] })));
  const m2 = memberMetrics(older, ['a']).get('a');
  assert.equal(m2.bestStreak, 4);
  assert.equal(m2.currentStreak, 1);
});

test('decliner and ghost count out and no reply; responder = attended + declined', () => {
  const events = newestFirst([
    ev(1, { members: ['a', 'b'], inn: ['a'], out: ['b'] }),
    ev(2, { members: ['a', 'b'], out: ['a', 'b'] }),
    ev(3, { members: ['a', 'b'], inn: ['a'] }),
  ]);
  const m = memberMetrics(events, ['a', 'b']);
  assert.deepEqual([m.get('b').declined, m.get('b').noResponse], [2, 1]);
  const awards = computeAwards(m, noExtras);
  assert.deepEqual(award(awards, 'decliner').ranking.map((x) => [x.id, x.value]), [['b', 2], ['a', 1]]);
  assert.deepEqual(award(awards, 'ghost').ranking.map((x) => [x.id, x.value]), [['b', 1]]);
  assert.deepEqual(award(awards, 'responder').ranking.map((x) => [x.id, x.value]), [['a', 3], ['b', 2]]);
});

test('awards with nobody qualifying are omitted', () => {
  const m = memberMetrics([ev(1, { members: ['a'], inn: ['a'] })], ['a']);
  assert.deepEqual(computeAwards(m, noExtras), []);
});

// ---- Task 2: timing and per-person awards ----
import { countEventsWith } from './statsAwards.js';
const MIN = 60 * 1000;
const at = (date, minutes) => new Date(date.getTime() + minutes * MIN);
const logged = (n, entries, rest = {}) => {
  const open = at(day(n), -48 * 60);
  return ev(n, {
    members: ['a', 'b'],
    rsvpOpenDate: open,
    rsvpLog: entries.map(([user, status, mins]) => ({ user, status, at: at(open, mins) })),
    ...rest,
  });
};
const withExtras = (events, ids) => {
  const m = memberMetrics(events, ids);
  return computeAwards(m, { chat: null, polls: new Map(), eventsWith: countEventsWith(events) });
};

test('quickDraw averages minutes from opening to first answer, lower wins', () => {
  const events = newestFirst([
    logged(1, [['a', 'in', 10], ['b', 'in', 100], ['a', 'out', 500]]),
    logged(2, [['a', 'in', 20], ['b', 'in', 100]]),
    logged(3, [['a', 'out', 30], ['b', 'in', 100]]),
  ]);
  const m = memberMetrics(events, ['a', 'b']);
  assert.equal(m.get('a').quickDrawMin, 20);
  const r = award(withExtras(events, ['a', 'b']), 'quickDraw');
  assert.deepEqual(r.ranking.map((x) => [x.id, x.value, x.rank]), [['a', 20, 1], ['b', 100, 2]]);
});

test('quickDraw uses tier opening and clamps at 0', () => {
  const events = newestFirst([1, 2, 3].map((n) => {
    const e = logged(n, [['a', 'in', -30]]); // 30 min before the general open
    e.tierOpens = [{ user: 'a', opensAt: at(e.rsvpOpenDate, n === 3 ? -10 : -60) }];
    return e;
  }));
  // tier opened 60 min early twice (answer 30 min after) and 10 min early once (answer 20 min before -> 0)
  assert.equal(memberMetrics(events, ['a']).get('a').quickDrawMin, 20);
});

test('quickDraw ignores events without rsvpOpenDate', () => {
  const events = newestFirst([1, 2, 3].map((n) => logged(n, [['a', 'in', 10]])));
  events[0].rsvpOpenDate = null;
  const m = memberMetrics(events, ['a']).get('a');
  assert.equal(m.timedAnswered, 3);
  assert.equal(m.quickDrawMin, null); // only 2 timed answers with an opening time
});

test('quickDraw needs 3 answered logged meetups', () => {
  const events = newestFirst([1, 2].map((n) => logged(n, [['a', 'in', 5]])));
  assert.equal(award(withExtras(events, ['a']), 'quickDraw'), undefined);
});

test('buzzer counts first answers within 2h of close, falls back to start', () => {
  const events = newestFirst([1, 2, 3].map((n) => logged(n, [])));
  const [e3, e2, e1] = events;
  e1.rsvpCloseDate = at(e1.date, -24 * 60);
  e1.rsvpLog = [{ user: 'a', status: 'in', at: at(e1.rsvpCloseDate, -90) }];   // last-minute
  e2.rsvpLog = [{ user: 'a', status: 'out', at: at(e2.date, -30) }];           // no close: start time, last-minute
  e3.rsvpCloseDate = at(e3.date, -60);
  e3.rsvpLog = [{ user: 'a', status: 'in', at: at(e3.rsvpCloseDate, -180) },  // first answer too early
    { user: 'a', status: 'out', at: at(e3.rsvpCloseDate, -5) }];
  assert.equal(memberMetrics(events, ['a']).get('a').buzzer, 2);
  assert.deepEqual(award(withExtras(events, ['a']), 'buzzer').ranking.map((x) => x.value), [2]);
});

test('weathervane counts status changes after the first, min 2', () => {
  const events = newestFirst([
    logged(1, [['a', 'in', 1], ['a', 'out', 2], ['a', 'in', 3], ['b', 'in', 1], ['b', 'out', 2]]),
    logged(2, [['a', 'in', 1], ['b', 'in', 1]]),
    logged(3, [['a', 'waitlist', 1], ['a', 'waitlist', 2], ['b', 'in', 1]]),
  ]);
  const m = memberMetrics(events, ['a', 'b']);
  assert.equal(m.get('a').changes, 2);
  assert.equal(m.get('b').changes, 1);
  assert.deepEqual(award(withExtras(events, ['a', 'b']), 'weathervane').ranking.map((x) => [x.id, x.value]), [['a', 2]]);
});

test('old records without log are ignored by timing awards', () => {
  const events = newestFirst([
    ev(1, { members: ['a', 'b'] }), ev(2, { members: ['a', 'b'] }), ev(3, { members: ['a', 'b'] }), // old: no log
    logged(4, [['b', 'in', 5]]), logged(5, [['b', 'in', 5]]), logged(6, [['b', 'in', 5]]),
  ]);
  const m = memberMetrics(events, ['a', 'b']);
  assert.equal(m.get('a').timedAnswered, 0);
  assert.equal(m.get('a').quickDrawMin, null);
  assert.equal(m.get('b').timedAnswered, 3);
  const awards = withExtras(events, ['a', 'b']);
  assert.deepEqual(award(awards, 'quickDraw').ranking.map((x) => x.id), ['b']);
  assert.equal(award(awards, 'weathervane'), undefined);
  assert.equal(award(awards, 'buzzer'), undefined);
});

test('plusOne/chauffeur/snackCaptain sum per-person data and are omitted when fewer than 3 events carry it', () => {
  const pp = (n, extra) => ev(n, { members: ['a', 'b'], guestsBy: [], itemsBy: [], seatsBy: [], ...extra });
  const two = newestFirst([
    pp(1, { guestsBy: [{ user: 'a', count: 2 }], itemsBy: [{ user: 'b', count: 1 }], seatsBy: [{ user: 'b', seats: 3 }] }),
    pp(2, { guestsBy: [{ user: 'a', count: 1 }, { user: 'b', count: 1 }] }),
    ev(3, { members: ['a', 'b'] }),
  ]);
  const twoAwards = withExtras(two, ['a', 'b']);
  assert.equal(award(twoAwards, 'plusOne'), undefined);
  const three = newestFirst([...two, pp(4, { itemsBy: [{ user: 'b', count: 2 }], seatsBy: [{ user: 'a', seats: 4 }, { user: 'b', seats: 1 }] })]);
  assert.deepEqual(countEventsWith(three), { log: 0, perPerson: 3 });
  const awards = withExtras(three, ['a', 'b']);
  assert.deepEqual(award(awards, 'plusOne').ranking.map((x) => [x.id, x.value]), [['a', 3], ['b', 1]]);
  assert.deepEqual(award(awards, 'snackCaptain').ranking.map((x) => [x.id, x.value]), [['b', 3]]);
  const ch = award(awards, 'chauffeur').ranking;
  assert.deepEqual(ch.map((x) => [x.id, x.value, x.rank]).sort(), [['a', 4, 1], ['b', 4, 1]]); // 3 + 1 for b: a tie
});

// ---- Task 3: chat and polls ----
test('chatty needs 10 messages and is omitted when chat is null', () => {
  const m = memberMetrics([], ['a', 'b', 'c']);
  const base = { polls: new Map(), eventsWith: { log: 0, perPerson: 0 } };
  assert.equal(award(computeAwards(m, { ...base, chat: null }), 'chatty'), undefined);
  const chat = new Map([['a', 40], ['b', 9], ['zz', 500]]); // zz is not a member
  assert.deepEqual(award(computeAwards(m, { ...base, chat }), 'chatty').ranking.map((x) => [x.id, x.value]), [['a', 40]]);
});

test('voice needs 3 polls', () => {
  const m = memberMetrics([], ['a', 'b']);
  const polls = new Map([['a', 3], ['b', 2]]);
  const r = award(computeAwards(m, { chat: null, polls, eventsWith: { log: 0, perPerson: 0 } }), 'voice');
  assert.deepEqual(r.ranking.map((x) => [x.id, x.value]), [['a', 3]]);
});

// ---- review fixes ----
test('waitlisted at the end counts as an answer, not a no-reply', () => {
  const events = newestFirst([1, 2, 3].map((n) => ev(n, { members: ['a'], waitlist: ['a'] })));
  const m = memberMetrics(events, ['a']).get('a');
  assert.deepEqual([m.eligible, m.attended, m.declined, m.noResponse, m.waitlisted], [3, 0, 0, 0, 3]);
  const awards = computeAwards(memberMetrics(events, ['a']), noExtras);
  assert.equal(award(awards, 'ghost'), undefined);
  assert.deepEqual(award(awards, 'responder').ranking.map((x) => x.value), [3]);
});
