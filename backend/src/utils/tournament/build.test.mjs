import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvent } from './build.js';

const people = (n) => Array.from({ length: n }, (_, i) => ({ key: `p${i + 1}`, user: `p${i + 1}`, guestOf: null, guestIndex: null }));
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const base = { mode: 'teams', format: 'roundRobin', teamsPerMatch: 2, resultType: 'points', balanceTeams: false, buildToFinale: false };
const build = (n, over = {}, extra = {}) => buildEvent({ players: people(n), config: { ...base, ...over }, rankingOrder: [], rng: seq([0.3, 0.8, 0.1, 0.6]), ...extra });

test('singles round robin of 12: 12 one-person entrants, 66 matches', () => {
  const e = build(12, { mode: 'singles' });
  assert.equal(e.teams.length, 12);
  assert.ok(e.teams.every((t) => t.players.length === 1 && t.name === null));
  assert.equal(e.matches.length, 66);
  assert.ok(e.matches.every((m) => m.status === 'ready' && m.id && m.slots.length === 2));
  assert.equal(e.playersKey.split(',').length, 12);
});

test('pairs of 12 into single elimination: 6 teams, 2 byes', () => {
  const e = build(12, { teamSize: 2, format: 'single', resultType: 'winLoss' });
  assert.equal(e.teams.length, 6);
  assert.deepEqual(e.teams.map((t) => t.key), ['t1', 't2', 't3', 't4', 't5', 't6']);
  assert.deepEqual(e.teams.map((t) => t.name), ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6']);
  assert.equal(e.matches.filter((m) => m.status === 'bye').length, 2);
});

test('an odd number in pairs: the top-ranked player gets their own team (and seed 1)', () => {
  const e = buildEvent({ players: people(7), config: { ...base, teamSize: 2, balanceTeams: true }, rankingOrder: people(7).map((p) => p.user), rng: Math.random });
  const solo = e.teams.filter((t) => t.players.length === 1);
  assert.equal(e.teams.length, 4);
  assert.deepEqual(solo.map((t) => t.players[0].key), ['p1']);
  assert.equal(solo[0].seed, 1);
  const finaleOnly = buildEvent({ players: people(5), config: { ...base, teamSize: 2, buildToFinale: true }, rankingOrder: ['p3'], rng: Math.random });
  assert.deepEqual(finaleOnly.teams.filter((t) => t.players.length === 1).map((t) => t.players[0].key), ['p3']);
  const unranked = build(5, { teamSize: 2 });
  assert.deepEqual(unranked.teams.map((t) => t.players.length).sort(), [1, 2, 2]);
});

test('just teams: teams, no matches', () => {
  const e = build(8, { teamCount: 2, format: 'none' });
  assert.equal(e.teams.length, 2);
  assert.deepEqual(e.matches, []);
});

test('config errors', () => {
  const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'no error'; };
  assert.equal(code(() => build(8, { teamSize: 2, format: 'double', teamsPerMatch: 3 })), 'double_needs_pairs');
  assert.equal(code(() => build(17, { mode: 'singles' })), 'too_many_for_round_robin');
  assert.equal(code(() => build(33, { mode: 'singles', format: 'single' })), 'too_many_entrants');
  assert.equal(code(() => build(1, { mode: 'singles' })), 'not_enough_players');
  assert.equal(code(() => build(8, { mode: 'singles', format: 'none' })), 'none_needs_teams');
  assert.equal(code(() => build(8, { mode: 'singles', resultType: 'places' })), 'places_needs_multi');
  assert.equal(code(() => build(8, { mode: 'singles', format: 'single', teamsPerMatch: 4, resultType: 'winLoss' })), 'win_loss_needs_two');
  assert.equal(code(() => build(3, { mode: 'singles', teamsPerMatch: 4 })), 'too_few_for_match');
  assert.equal(code(() => build(4, { mode: 'singles', format: 'swiss' })), 'invalid_config');
  assert.equal(code(() => build(4, { teamCount: 2, teams: [{ name: 'A', players: ['p1', 'p2'] }, { name: 'B', players: ['p3'] }] })), 'players_mismatch');
  assert.equal(code(() => build(4, { teamCount: 2, teams: [{ name: 'A', players: ['p1', 'p2'] }, { name: 'B', players: ['p3', 'p3', 'p4'] }] })), 'players_mismatch');
  assert.equal(code(() => build(4, { teams: [{ name: 'x'.repeat(25), players: ['p1', 'p2'] }, { name: 'B', players: ['p3', 'p4'] }] })), 'name_too_long');
});

test('hand-set teams and seed order are kept', () => {
  const e = build(4, { format: 'single', resultType: 'winLoss', teams: [{ name: 'Reds', players: ['p1', 'p3'] }, { name: '', players: ['p2', 'p4'] }], seedOrder: [1, 0] });
  assert.deepEqual(e.teams.map((t) => [t.name, t.players.map((p) => p.key), t.seed]), [['Reds', ['p1', 'p3'], 2], ['Team 2', ['p2', 'p4'], 1]]);
});

test('balance + a ranking: snake draft and seeds follow the ranking; finale puts the top two last', () => {
  const e = buildEvent({ players: people(8), config: { ...base, teamCount: 4, balanceTeams: true, buildToFinale: true }, rankingOrder: people(8).map((p) => p.user), rng: Math.random });
  assert.deepEqual(e.teams.map((t) => t.players.map((p) => p.key)), [['p1', 'p8'], ['p2', 'p7'], ['p3', 'p6'], ['p4', 'p5']]);
  // all average 4.5: the best single rank decides
  assert.deepEqual(e.teams.map((t) => t.seed), [1, 2, 3, 4]);
  assert.deepEqual([...e.matches.at(-1).slots.map((s) => s.team)].sort(), ['t1', 't2']);
});

test('weighting off: different random draws give different orders', () => {
  const a = buildEvent({ players: people(6), config: { ...base, mode: 'singles' }, rankingOrder: [], rng: seq([0.9, 0.2, 0.5]) });
  const b = buildEvent({ players: people(6), config: { ...base, mode: 'singles' }, rankingOrder: [], rng: seq([0.1, 0.6, 0.3]) });
  const order = (e) => e.matches.map((m) => m.slots.map((s) => e.teams.find((t) => t.key === s.team).players[0].key).join('v'));
  assert.notDeepEqual(order(a), order(b));
});

test('a seed makes the event repeatable, and Start with the previewed teams gives the previewed matches', async () => {
  const { seededRng } = await import('./players.js');
  const cfgRR = { ...base, mode: 'teams', teamSize: 2, format: 'roundRobin' };
  const preview = buildEvent({ players: people(8), config: cfgRR, rankingOrder: [], rng: seededRng(42), orderRng: seededRng(43) });
  const again = buildEvent({ players: people(8), config: cfgRR, rankingOrder: [], rng: seededRng(42), orderRng: seededRng(43) });
  assert.deepEqual(again.matches, preview.matches);
  const teams = preview.teams.map((t) => ({ name: t.name, players: t.players.map((p) => p.key) }));
  const seedOrder = [...preview.teams.keys()].sort((a, b) => preview.teams[a].seed - preview.teams[b].seed);
  const start = buildEvent({ players: people(8), config: { ...cfgRR, teams, seedOrder }, rankingOrder: [], rng: seededRng(42), orderRng: seededRng(43) });
  assert.deepEqual(start.matches, preview.matches);
  const other = buildEvent({ players: people(8), config: { ...cfgRR, teams, seedOrder }, rankingOrder: [], rng: seededRng(7), orderRng: seededRng(8) });
  assert.notDeepEqual(other.matches.map((m) => m.slots.map((s) => s.team)), preview.matches.map((m) => m.slots.map((s) => s.team)));
  const r1 = seededRng(1);
  const vals = [r1(), r1(), r1()];
  assert.ok(vals.every((v) => v >= 0 && v < 1) && new Set(vals).size === 3);
});
