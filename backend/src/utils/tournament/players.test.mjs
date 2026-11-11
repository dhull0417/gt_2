import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPlayers, playersKey, rankPlayers, formTeams, teamSeeds } from './players.js';

const clerk = { A: 'cA', B: 'cB', C: 'cC', D: 'cD' };
const clerkIdOf = (id) => clerk[id];
const meetup = (over = {}) => ({ in: ['A', 'B'], out: [], guests: [{ userId: 'cB', count: 2 }], ...over });
const keys = (ps) => ps.map((p) => p.key);
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('collectPlayers: In, their guests, then ticked extras', () => {
  const ps = collectPlayers(meetup(), { extraPlayers: ['C'], clerkIdOf });
  assert.deepEqual(keys(ps), ['A', 'B', 'guest:cB:1', 'guest:cB:2', 'C']);
  assert.deepEqual(ps[2], { key: 'guest:cB:1', user: null, guestOf: 'cB', guestIndex: 1 });
  assert.deepEqual(ps[0], { key: 'A', user: 'A', guestOf: null, guestIndex: null });
});

test('collectPlayers: an extra who went Out is dropped; extras already In are not doubled', () => {
  const ps = collectPlayers(meetup({ out: ['C'] }), { extraPlayers: ['C', 'A'], clerkIdOf });
  assert.deepEqual(keys(ps), ['A', 'B', 'guest:cB:1', 'guest:cB:2']);
});

test('collectPlayers: a host who goes Out takes their guests with them', () => {
  const ps = collectPlayers(meetup({ in: ['A'], out: ['B'] }), { extraPlayers: [], clerkIdOf });
  assert.deepEqual(keys(ps), ['A']);
});

test('collectPlayers accepts ObjectId-like values', () => {
  const oid = (s) => ({ toString: () => s });
  const ps = collectPlayers({ in: [oid('A')], out: [], guests: [] }, { extraPlayers: [oid('D')], clerkIdOf });
  assert.deepEqual(keys(ps), ['A', 'D']);
});

test('playersKey ignores order', () => {
  const a = collectPlayers(meetup(), { extraPlayers: ['C'], clerkIdOf });
  assert.equal(playersKey(a), playersKey([...a].reverse()));
  assert.notEqual(playersKey(a), playersKey(a.slice(1)));
});

test('rankPlayers: listed players in list order, the rest after (shuffled)', () => {
  const ps = collectPlayers(meetup(), { extraPlayers: ['C'], clerkIdOf });
  const r = rankPlayers(ps, ['C', 'Z', 'A'], seq([0.1, 0.9, 0.5, 0.3]));
  assert.deepEqual(keys(r).slice(0, 2), ['C', 'A']);
  assert.deepEqual(new Set(keys(r).slice(2)), new Set(['B', 'guest:cB:1', 'guest:cB:2']));
});

const people = (n) => Array.from({ length: n }, (_, i) => ({ key: `p${i + 1}`, user: `p${i + 1}`, guestOf: null, guestIndex: null }));
const sizes = (teams) => teams.map((t) => t.length).sort((a, b) => b - a);

test('formTeams by size spreads the leftover so sizes differ by at most one', () => {
  const t = formTeams(people(13), { teamSize: 2 });
  assert.equal(t.length, 6);
  assert.deepEqual(sizes(t), [3, 2, 2, 2, 2, 2]);
  assert.equal(t.flat().length, 13);
});

test('formTeams by count', () => {
  assert.deepEqual(sizes(formTeams(people(10), { teamCount: 4 })), [3, 3, 2, 2]);
});

test('formTeams with balance snake-drafts by rank', () => {
  const t = formTeams(people(8), { teamCount: 2, balance: true });
  assert.deepEqual(t[0].map((p) => p.key), ['p1', 'p4', 'p5', 'p8']);
  assert.deepEqual(t[1].map((p) => p.key), ['p2', 'p3', 'p6', 'p7']);
});

test('formTeams errors', () => {
  assert.throws(() => formTeams(people(4), {}), { code: 'team_size_required' });
  assert.throws(() => formTeams(people(3), { teamCount: 4 }), { code: 'too_many_teams' });
  assert.throws(() => formTeams(people(3), { teamSize: 4 }), { code: 'too_many_teams' });
});

test('teamSeeds: lower average rank = stronger seed; ties go to the best single rank', () => {
  const ranked = people(6);
  const P = (i) => ranked[i - 1];
  const teams = [[P(3), P(4)], [P(1), P(6)], [P(2), P(5)]]; // avgs 3.5, 3.5, 3.5
  assert.deepEqual(teamSeeds(teams, ranked), [3, 1, 2]);
  assert.deepEqual(teamSeeds([[P(5)], [P(1)], [P(3)]], ranked), [3, 1, 2]);
});
