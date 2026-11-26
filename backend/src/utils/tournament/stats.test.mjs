import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTournamentStats } from './stats.js';

const P = (user) => ({ key: user, user, guestOf: null, guestIndex: null });
const G = (host, n) => ({ key: `guest:${host}:${n}`, user: null, guestOf: host, guestIndex: n });
const match = (results) => ({ id: 'm', status: 'done', slots: results.map(([team]) => ({ team })), results: results.map(([team, place]) => ({ team, place })) });
const event = (id, date, teams, matches, champion, over = {}) => ({
  _id: id, meetup: `meet-${id}`, meetupStartsAt: new Date(date), format: 'roundRobin', mode: 'teams', status: 'finished',
  teams: teams.map(([key, players, name = key]) => ({ key, name, players })), matches, champion, ...over,
});

const e1 = event('e1', '2026-10-01', [['t1', [P('a'), P('b')]], ['t2', [P('c'), G('cc', 1)]]], [match([['t1', 1], ['t2', 2]])], 't1');
const e2 = event('e2', '2026-11-01', [['t1', [P('b'), P('a')]], ['t2', [P('c'), P('d')]]], [match([['t2', 1], ['t1', 2]]), match([['t1', 1], ['t2', 1]])], 't2');
const e3 = event('e3', '2026-11-05', [['t1', [P('a')]], ['t2', [P('b')]], ['t3', [P('c')]], ['t4', [P('d')]]],
  [match([['t3', 1], ['t1', 2], ['t2', 3], ['t4', 4]])], 't3', { mode: 'singles', format: 'single' });
const unfinished = event('e4', '2026-11-09', [['t1', [P('a')]], ['t2', [P('b')]]], [match([['t1', 1], ['t2', 2]])], null, { status: 'active' });

const s = buildTournamentStats([e1, e2, e3, unfinished]);
const person = (u) => s.people.find((p) => p.user === u);

test('people: wins, losses, ties, titles, events; guests never appear', () => {
  assert.deepEqual(person('a'), { user: 'a', events: 3, wins: 1, losses: 2, ties: 1, winPct: 0.375, titles: 1 });
  assert.deepEqual(person('c'), { user: 'c', events: 3, wins: 2, losses: 1, ties: 1, winPct: 0.625, titles: 2 });
  assert.equal(person('d').events, 2);
  assert.ok(s.people.every((p) => p.user));
  assert.equal(s.people.length, 4);
});

test('a 4-way match counts 1st as a win and everyone else as a loss', () => {
  assert.equal(person('b').losses, 2);
  assert.equal(person('d').losses, 1);
});

test('teams: identical member sets with 2+ events; a team with a guest has no team record', () => {
  assert.deepEqual(s.teams, [{ users: ['a', 'b'], events: 2, wins: 1, losses: 1, ties: 1, winPct: 0.5, titles: 1 }]);
});

test('titles leaderboard and past events (newest first, finished only)', () => {
  assert.deepEqual(s.titles, [{ user: 'c', titles: 2 }, { user: 'a', titles: 1 }, { user: 'b', titles: 1 }, { user: 'd', titles: 1 }]);
  assert.deepEqual(s.events.map((e) => e.tournamentId), ['e3', 'e2', 'e1']);
  assert.deepEqual(s.events[1].champion, { team: 't2', name: 't2', users: ['c', 'd'] });
  assert.equal(s.events[0].mode, 'singles');
});
