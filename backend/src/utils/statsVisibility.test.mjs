import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeStatsForViewer, LEADERBOARD_SIZE } from './statsVisibility.js';

const person = (id, value, rank) => ({ _id: id, firstName: id.toUpperCase(), lastName: '', profilePicture: null, value, rank });
const full = () => ({
  summary: { totalMeetups: 6, averageHeadcount: 4, averageFill: null },
  members: ['a', 'b', 'c'].map((id, i) => ({ _id: id, firstName: id, eligible: 6, attended: 5 - i, declined: i, noResponse: 1, rate: 0.5, streak: 1, bestStreak: 3 })),
  meetups: [],
  awards: [
    { key: 'reliable', title: "Ol' Reliable", emoji: '🫡', joke: false, lowerIsBetter: false,
      ranking: ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => person(id, 10 - i, i + 1)) },
    { key: 'decliner', title: 'Professional Decliner', emoji: '🙅', joke: true, lowerIsBetter: false,
      ranking: [person('c', 2, 1), person('b', 1, 2)] },
  ],
});

test('organizer sees joke awards', () => {
  const r = shapeStatsForViewer(full(), { viewerId: 'a', isOrganizer: true, revealJokes: false });
  assert.deepEqual(r.awards.map((a) => a.key), ['reliable', 'decliner']);
  assert.deepEqual(r.viewer, { isOrganizer: true, jokesVisible: true, revealJokes: false });
  assert.equal(r.members[1].declined, 1);
});

test('revealed shows joke awards to members', () => {
  const r = shapeStatsForViewer(full(), { viewerId: 'b', isOrganizer: false, revealJokes: true });
  assert.deepEqual(r.awards.map((a) => a.key), ['reliable', 'decliner']);
  assert.equal(r.members[2].noResponse, 1);
  assert.equal(r.viewer.jokesVisible, true);
});

test('member response hides joke data', () => {
  const r = shapeStatsForViewer(full(), { viewerId: 'b', isOrganizer: false, revealJokes: false });
  assert.deepEqual(r.awards.map((a) => a.key), ['reliable']);
  const json = JSON.stringify(r);
  assert.ok(!json.includes('decliner'), 'no decliner anywhere');
  assert.ok(!json.includes('Professional Decliner'));
  const others = r.members.filter((m) => m._id !== 'b');
  assert.ok(others.every((m) => m.declined === null && m.noResponse === null));
  const me = r.members.find((m) => m._id === 'b');
  assert.deepEqual([me.declined, me.noResponse], [1, 1]);
  assert.equal(r.viewer.jokesVisible, false);
});

test('me ranks joke categories only when visible', () => {
  const hidden = shapeStatsForViewer(full(), { viewerId: 'b', isOrganizer: false, revealJokes: false });
  assert.deepEqual(hidden.me, { _id: 'b', categories: [{ key: 'reliable', value: 9, rank: 2, of: 6 }] });
  const shown = shapeStatsForViewer(full(), { viewerId: 'b', isOrganizer: true, revealJokes: false });
  assert.deepEqual(shown.me.categories, [{ key: 'reliable', value: 9, rank: 2, of: 6 }, { key: 'decliner', value: 1, rank: 2, of: 2 }]);
  const notRanked = shapeStatsForViewer(full(), { viewerId: 'zz', isOrganizer: true, revealJokes: false });
  assert.deepEqual(notRanked.me.categories[0], { key: 'reliable', value: null, rank: null, of: 6 });
});

test('leaderboard is top 5 and winners are everyone ranked first', () => {
  assert.equal(LEADERBOARD_SIZE, 5);
  const f = full();
  f.awards[0].ranking[1].rank = 1; f.awards[0].ranking[1].value = 10;
  const r = shapeStatsForViewer(f, { viewerId: 'a', isOrganizer: false, revealJokes: false });
  assert.equal(r.awards[0].leaderboard.length, 5);
  assert.deepEqual(r.awards[0].winners.map((w) => w._id), ['a', 'b']);
  assert.equal(r.awards[0].ranking, undefined);
});

test('Always Answers numbers are hidden while jokes are hidden (they reveal Outs by subtraction)', () => {
  const f = full();
  f.awards.splice(1, 0, { key: 'responder', title: 'Always Answers', emoji: '✋', joke: false, lowerIsBetter: false,
    ranking: [person('a', 6, 1), person('b', 5, 2)] });
  const hidden = shapeStatsForViewer(f, { viewerId: 'b', isOrganizer: false, revealJokes: false });
  const r = hidden.awards.find((a) => a.key === 'responder');
  assert.ok(r.leaderboard.every((p) => p.value === null) && r.winners.every((p) => p.value === null));
  assert.deepEqual(hidden.me.categories.find((c) => c.key === 'responder'), { key: 'responder', value: 5, rank: 2, of: 2 });
  const shown = shapeStatsForViewer(f, { viewerId: 'b', isOrganizer: true, revealJokes: false });
  assert.equal(shown.awards.find((a) => a.key === 'responder').leaderboard[0].value, 6);
});
