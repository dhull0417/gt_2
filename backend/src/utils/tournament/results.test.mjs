import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResult, applyResult, standings, championOf } from './results.js';
import { singleElimination, doubleElimination, resolveSlots, rankedTeams } from './bracket.js';
import { roundRobin } from './roundRobin.js';

const team = (id, seed) => ({ _id: id, name: id, seed, players: [] });
const rrMatch = (id, teams) => ({ id, round: 1, order: 1, bracket: null, advance: null, slots: teams.map((t) => ({ team: t, from: null })), results: [], status: 'ready' });

const rrEvent = (teamIds, perMatch = 2, resultType = 'points') => {
  const matches = roundRobin(teamIds, { perMatch, rng: () => 0.5 }).map((m, i) => ({ ...rrMatch(`m${i + 1}`, m.teams), round: m.round, order: m.order }));
  return { format: 'roundRobin', teamsPerMatch: perMatch, resultType, status: 'active', champion: null, teams: teamIds.map((t, i) => team(t, i + 1)), matches };
};
const bracketEvent = (n, format = 'single', perMatch = 2, resultType = 'winLoss') => {
  const ids = Array.from({ length: n }, (_, i) => `t${i + 1}`);
  const matches = format === 'double' ? doubleElimination(ids) : singleElimination(ids, { perMatch });
  resolveSlots(matches);
  return { format, teamsPerMatch: perMatch, resultType, status: 'active', champion: null, teams: ids.map((t, i) => team(t, i + 1)), matches };
};
const matchOf = (t, a, b) => t.matches.find((m) => {
  const ts = m.slots.map((s) => s.team);
  return ts.includes(a) && ts.includes(b);
});

test('points: higher score wins; a tie is allowed only when asked', () => {
  const m = rrMatch('m1', ['A', 'B']);
  assert.deepEqual(normalizeResult(m, 'points', { scores: { A: 11, B: 7 } }, { allowTie: true }),
    [{ team: 'A', place: 1, points: 11 }, { team: 'B', place: 2, points: 7 }]);
  assert.deepEqual(normalizeResult(m, 'points', { scores: { A: 7, B: 7 } }, { allowTie: true }).map((r) => r.place), [1, 1]);
  assert.throws(() => normalizeResult(m, 'points', { scores: { A: 7, B: 7 } }, { allowTie: false }), { code: 'tie_not_allowed' });
});

test('invalid bodies are rejected', () => {
  const m = rrMatch('m1', ['A', 'B']);
  assert.throws(() => normalizeResult(m, 'points', { scores: { A: 11 } }, { allowTie: true }), { code: 'invalid_result' });
  assert.throws(() => normalizeResult(m, 'points', { scores: { A: 11, B: -1 } }, { allowTie: true }), { code: 'invalid_result' });
  assert.throws(() => normalizeResult(m, 'points', { scores: { A: 1000, B: 1 } }, { allowTie: true }), { code: 'invalid_result' });
  assert.throws(() => normalizeResult(m, 'points', { scores: { A: 1.5, B: 1 } }, { allowTie: true }), { code: 'invalid_result' });
  assert.throws(() => normalizeResult(m, 'winLoss', { winner: 'Z' }, { allowTie: true }), { code: 'invalid_result' });
  assert.throws(() => normalizeResult(m, 'winLoss', { winner: null }, { allowTie: false }), { code: 'tie_not_allowed' });
});

test('places must list every team once', () => {
  const m = rrMatch('m1', ['A', 'B', 'C', 'D']);
  assert.deepEqual(normalizeResult(m, 'places', { order: ['C', 'A', 'D', 'B'] }, { allowTie: true }).map((r) => [r.team, r.place]),
    [['C', 1], ['A', 2], ['D', 3], ['B', 4]]);
  assert.throws(() => normalizeResult(m, 'places', { order: ['C', 'A', 'D'] }, { allowTie: true }), { code: 'invalid_result' });
  assert.throws(() => normalizeResult(m, 'places', { order: ['C', 'A', 'D', 'D'] }, { allowTie: true }), { code: 'invalid_result' });
});

test('4-team bracket match: a points tie across the advance line is rejected, below it is fine', () => {
  const m = { ...rrMatch('m1', ['A', 'B', 'C', 'D']), advance: 2 };
  assert.throws(() => normalizeResult(m, 'points', { scores: { A: 9, B: 5, C: 5, D: 1 } }, { allowTie: false }), { code: 'tie_not_allowed' });
  assert.deepEqual(normalizeResult(m, 'points', { scores: { A: 9, B: 7, C: 5, D: 5 } }, { allowTie: false }).map((r) => r.place), [1, 2, 3, 3]);
});

test('round robin standings: head-to-head breaks a tie on wins', () => {
  const t = rrEvent(['A', 'B', 'C', 'D'], 2, 'winLoss');
  const win = (a, b) => applyResult(t, matchOf(t, a, b).id, { winner: a }, { isManager: false });
  win('A', 'B'); win('A', 'C'); win('D', 'A'); win('B', 'C'); win('B', 'D'); win('C', 'D');
  const s = standings(t);
  assert.deepEqual(s.map((r) => r.team), ['A', 'B', 'C', 'D']);
  assert.deepEqual(s.map((r) => [r.wins, r.losses]), [[2, 1], [2, 1], [1, 2], [1, 2]]);
});

test('round robin: a three-way circle with equal scores falls to point difference, then seed', () => {
  const t = rrEvent(['A', 'B', 'C']);
  applyResult(t, matchOf(t, 'A', 'B').id, { scores: { A: 1, B: 0 } }, {});
  applyResult(t, matchOf(t, 'B', 'C').id, { scores: { B: 1, C: 0 } }, {});
  const r = applyResult(t, matchOf(t, 'C', 'A').id, { scores: { C: 1, A: 0 } }, {});
  assert.deepEqual(standings(t).map((x) => x.team), ['A', 'B', 'C']);
  assert.equal(r.finished, true);
  assert.equal(t.status, 'finished');
  assert.equal(t.champion, 'A');
  applyResult(t, matchOf(t, 'C', 'A').id, { scores: { C: 5, A: 0 } }, {});
  assert.equal(standings(t)[0].team, 'C');
  assert.equal(t.champion, 'C');
});

test('round robin ties count half a win', () => {
  const t = rrEvent(['A', 'B']);
  applyResult(t, t.matches[0].id, { scores: { A: 3, B: 3 } }, {});
  assert.deepEqual(standings(t).map((r) => [r.ties, r.score]), [[1, 0.5], [1, 0.5]]);
});

test('k-team round robin scores k - place', () => {
  const t = rrEvent(['A', 'B', 'C', 'D'], 4, 'places');
  applyResult(t, t.matches[0].id, { order: ['B', 'D', 'A', 'C'] }, {});
  const s = Object.fromEntries(standings(t).map((r) => [r.team, r.score]));
  assert.deepEqual(s, { B: 3, D: 2, A: 1, C: 0 });
});

test('bracket: correcting a result after the winner played on is locked for players; a manager clears what follows', () => {
  const t = bracketEvent(4);
  const [m1, m2, fin] = t.matches;
  const winnerOf = (m) => m.slots.map((s) => s.team).sort()[0];
  applyResult(t, m1.id, { winner: winnerOf(m1) }, {});
  const r2 = applyResult(t, m2.id, { winner: winnerOf(m2) }, {});
  assert.deepEqual(r2.newlyReady, [fin.id]);
  applyResult(t, fin.id, { winner: 't1' }, {});
  assert.equal(t.status, 'finished');
  const other = m1.slots.map((s) => s.team).find((x) => x !== 't1');
  assert.throws(() => applyResult(t, m1.id, { winner: other }, { isManager: false }), { code: 'locked' });
  const r = applyResult(t, m1.id, { winner: other }, { isManager: true });
  assert.deepEqual(r.cleared, [fin.id]);
  assert.equal(fin.results.length, 0);
  assert.equal(fin.status, 'ready');
  assert.ok(fin.slots.some((s) => s.team === other));
  assert.equal(t.status, 'active');
  assert.equal(t.champion, null);
});

test('bracket: a score fix that keeps the same winner is not locked and clears nothing', () => {
  const t = bracketEvent(4, 'single', 2, 'points');
  const [m1, m2, fin] = t.matches;
  applyResult(t, m1.id, { scores: { t1: 11, t4: 3 } }, {});
  applyResult(t, m2.id, { scores: { t2: 11, t3: 3 } }, {});
  applyResult(t, fin.id, { scores: { t1: 11, t2: 9 } }, {});
  const r = applyResult(t, m1.id, { scores: { t1: 11, t4: 5 } }, { isManager: false });
  assert.deepEqual(r.cleared, []);
  assert.equal(fin.results.length, 2);
});

test('double elimination: a manager correction clears the losers-bracket path too', () => {
  const t = bracketEvent(4, 'double');
  const play = () => {
    for (let guard = 0; guard < 20; guard++) {
      const m = t.matches.find((x) => x.status === 'ready');
      if (!m) return;
      const ts = m.slots.map((s) => s.team).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
      applyResult(t, m.id, { winner: ts[0] }, { isManager: true });
    }
  };
  play();
  assert.equal(t.status, 'finished');
  const m1 = t.matches[0];
  const loserPath = t.matches.filter((m) => m.slots.some((s) => s.from?.match === m1.id && s.from.loser));
  assert.equal(loserPath.length, 1);
  const r = applyResult(t, m1.id, { winner: m1.slots.map((s) => s.team).find((x) => x !== 't1') }, { isManager: true });
  assert.ok(r.cleared.includes(loserPath[0].id));
  assert.ok(r.cleared.includes(t.matches.find((m) => m.bracket === 'final').id));
});

test('waiting and bye matches cannot take a result; unknown match errors', () => {
  const t = bracketEvent(6);
  const bye = t.matches.find((m) => m.status === 'bye');
  const waiting = t.matches.find((m) => m.status === 'waiting');
  assert.throws(() => applyResult(t, bye.id, { winner: bye.slots.find((s) => s.team).team }, {}), { code: 'not_ready' });
  assert.throws(() => applyResult(t, waiting.id, { winner: 't1' }, {}), { code: 'not_ready' });
  assert.throws(() => applyResult(t, 'nope', { winner: 't1' }, {}), { code: 'match_not_found' });
});

test('championOf a bracket is the final winner; a just-teams event has none', () => {
  const t = bracketEvent(2);
  assert.equal(championOf(t), null);
  applyResult(t, t.matches[0].id, { winner: 't2' }, {});
  assert.equal(championOf(t), 't2');
  assert.equal(rankedTeams(t.matches[0])[0], 't2');
  assert.equal(championOf({ format: 'none', matches: [], teams: [] }), null);
});
