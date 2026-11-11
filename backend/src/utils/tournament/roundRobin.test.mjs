import test from 'node:test';
import assert from 'node:assert/strict';
import { roundRobin } from './roundRobin.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const seedOf = (id) => Number(id.slice(1));
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const pairKey = (a, b) => [a, b].sort().join('|');

const checkRounds = (matches) => {
  const byRound = new Map();
  for (const m of matches) {
    const set = byRound.get(m.round) || new Set();
    for (const t of m.teams) {
      assert.ok(!set.has(t), `${t} plays twice in round ${m.round}`);
      set.add(t);
    }
    byRound.set(m.round, set);
  }
  assert.deepEqual(matches.map((m) => m.order), matches.map((_, i) => i + 1));
  for (let i = 1; i < matches.length; i++) assert.ok(matches[i].round >= matches[i - 1].round, 'rounds in order');
};

const checkCover = (teams, matches, perMatch) => {
  const met = new Set();
  const played = new Map(teams.map((t) => [t, 0]));
  for (const m of matches) {
    assert.equal(m.teams.length, perMatch);
    assert.equal(new Set(m.teams).size, perMatch);
    for (const t of m.teams) played.set(t, played.get(t) + 1);
    for (let i = 0; i < m.teams.length; i++) for (let j = i + 1; j < m.teams.length; j++) met.add(pairKey(m.teams[i], m.teams[j]));
  }
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
    assert.ok(met.has(pairKey(teams[i], teams[j])), `${teams[i]} never meets ${teams[j]}`);
  }
  const counts = [...played.values()];
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `uneven match counts ${counts}`);
};

test('2 per match, 4 teams: 6 matches in 3 rounds, every pair once', () => {
  const m = roundRobin(ids(4), { perMatch: 2, rng: seq([0.3, 0.7, 0.1]) });
  assert.equal(m.length, 6);
  assert.equal(Math.max(...m.map((x) => x.round)), 3);
  assert.equal(new Set(m.map((x) => pairKey(...x.teams))).size, 6);
  checkRounds(m);
});

test('2 per match, 5 teams: 10 matches in 5 rounds (one bye each)', () => {
  const m = roundRobin(ids(5), { perMatch: 2 });
  assert.equal(m.length, 10);
  assert.equal(Math.max(...m.map((x) => x.round)), 5);
  checkRounds(m);
  checkCover(ids(5), m, 2);
});

test('2 teams: one match', () => {
  assert.equal(roundRobin(ids(2), { perMatch: 2 }).length, 1);
});

for (const perMatch of [3, 4]) {
  for (let n = perMatch; n <= 16; n++) {
    test(`${perMatch} per match, ${n} teams: covers every pair, even counts, valid rounds`, () => {
      const m = roundRobin(ids(n), { perMatch, rng: seq([0.42, 0.13, 0.77, 0.58]) });
      checkCover(ids(n), m, perMatch);
      checkRounds(m);
    });
  }
}

test('build to a finale: biggest mismatch first, top two seeds last', () => {
  const m = roundRobin(ids(6), { perMatch: 2, seedOf, finale: true });
  assert.deepEqual([...m.at(-1).teams].sort(), ['t1', 't2']);
  const first = m[0].teams.map(seedOf);
  assert.equal(Math.abs(first[0] - first[1]), 5);
  checkRounds(m);
  checkCover(ids(6), m, 2);
});

test('build to a finale with 4 per match ends with the top four together when that match exists', () => {
  const m = roundRobin(ids(8), { perMatch: 4, seedOf, finale: true });
  checkRounds(m);
  checkCover(ids(8), m, 4);
  const last = m.at(-1).teams.map(seedOf);
  const spreads = m.map((x) => Math.max(...x.teams.map(seedOf)) - Math.min(...x.teams.map(seedOf)));
  assert.equal(Math.max(...last) - Math.min(...last), Math.min(...spreads));
});

test('without finale the order follows the rng (deterministic for a fixed rng)', () => {
  const a = roundRobin(ids(6), { perMatch: 2, rng: seq([0.9, 0.2, 0.5]) });
  const b = roundRobin(ids(6), { perMatch: 2, rng: seq([0.9, 0.2, 0.5]) });
  const c = roundRobin(ids(6), { perMatch: 2, rng: seq([0.1, 0.6, 0.3]) });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((x) => x.teams), c.map((x) => x.teams));
});
