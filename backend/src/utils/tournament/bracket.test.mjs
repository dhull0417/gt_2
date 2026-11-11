import test from 'node:test';
import assert from 'node:assert/strict';
import { singleElimination, doubleElimination, resolveSlots, rankedTeams } from './bracket.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const seedOf = (id) => Number(id.slice(1));
const teamsOf = (m) => m.slots.map((s) => s.team).filter(Boolean);
const first = (ms) => ms.filter((m) => m.round === 1 && m.bracket !== 'losers' && m.bracket !== 'final');

/** Plays every ready match with the better seed winning, until nothing is ready. */
const playOut = (matches) => {
  resolveSlots(matches);
  for (let guard = 0; guard < 500; guard++) {
    const m = matches.find((x) => x.status === 'ready');
    if (!m) break;
    const ordered = [...teamsOf(m)].sort((a, b) => seedOf(a) - seedOf(b));
    m.results = ordered.map((team, i) => ({ team, place: i + 1 }));
    m.status = 'done';
    resolveSlots(matches);
  }
  return matches;
};

test('8 seeds, single elimination: standard first round', () => {
  const ms = singleElimination(ids(8), { perMatch: 2 });
  resolveSlots(ms);
  assert.deepEqual(first(ms).map((m) => teamsOf(m).map(seedOf)), [[1, 8], [4, 5], [2, 7], [3, 6]]);
  assert.equal(ms.length, 7);
  assert.ok(ms.every((m, i) => m.order === i + 1));
});

test('6 seeds: seeds 1 and 2 get byes and show up in round 2', () => {
  const ms = singleElimination(ids(6), { perMatch: 2 });
  const { newlyReady } = resolveSlots(ms);
  const byes = ms.filter((m) => m.status === 'bye');
  assert.deepEqual(byes.map((m) => teamsOf(m)).flat().sort(), ['t1', 't2']);
  const r2 = ms.filter((m) => m.round === 2);
  assert.ok(r2.some((m) => teamsOf(m).includes('t1')));
  assert.ok(r2.some((m) => teamsOf(m).includes('t2')));
  assert.ok(byes.every((m) => !newlyReady.includes(m.id)));
  assert.ok(newlyReady.length === 2 && newlyReady.every((id) => ms.find((m) => m.id === id).round === 1));
});

test('seeds 1 and 2 can only meet in the final', () => {
  for (const n of [4, 5, 8, 11, 16, 32]) {
    const ms = playOut(singleElimination(ids(n), { perMatch: 2 }));
    const final = ms.at(-1);
    assert.deepEqual(teamsOf(final).sort(), ['t1', 't2'], `n=${n}`);
    assert.equal(rankedTeams(final)[0], 't1');
  }
});

test('4 per match with 16: four first-round matches each with one top-4 seed; final fed by places 1-2', () => {
  const ms = singleElimination(ids(16), { perMatch: 4 });
  resolveSlots(ms);
  const r1 = first(ms);
  assert.equal(r1.length, 4);
  for (const m of r1) assert.equal(teamsOf(m).filter((t) => seedOf(t) <= 4).length, 1);
  const final = ms.at(-1);
  assert.equal(final.slots.length, 4);
  assert.deepEqual(final.slots.map((s) => s.from.place).sort(), [1, 1, 2, 2]);
  playOut(ms);
  assert.deepEqual(teamsOf(ms.at(-1)).sort(), ['t1', 't2', 't3', 't4']);
});

test('3 per match with 9: three matches then a final of three', () => {
  const ms = playOut(singleElimination(ids(9), { perMatch: 3 }));
  assert.equal(first(ms).length, 3);
  assert.equal(ms.length, 4);
  assert.deepEqual(teamsOf(ms.at(-1)).sort(), ['t1', 't2', 't3']);
});

test('odd sizes with 3 and 4 per match finish with a champion', () => {
  for (const [n, k] of [[5, 3], [7, 3], [5, 4], [6, 4], [10, 4], [13, 3]]) {
    const ms = playOut(singleElimination(ids(n), { perMatch: k }));
    const final = ms.at(-1);
    assert.equal(final.status, 'done', `n=${n} k=${k}`);
    assert.equal(rankedTeams(final)[0], 't1');
  }
});

test('double elimination with 4: 3 winners, 2 losers, 1 final', () => {
  const ms = doubleElimination(ids(4));
  const count = (b) => ms.filter((m) => m.bracket === b).length;
  assert.deepEqual([count('winners'), count('losers'), count('final')], [3, 2, 1]);
});

const lossCounts = (ms) => {
  const losses = new Map();
  for (const m of ms) if (m.status === 'done') {
    const ranked = rankedTeams(m);
    for (const t of ranked.slice(1)) losses.set(t, (losses.get(t) || 0) + 1);
  }
  return losses;
};

for (const n of [2, 3, 4, 5, 6, 7, 8, 12, 16]) {
  test(`double elimination with ${n}: everyone but the champion is out after two losses (final loser may have one)`, () => {
    const ms = playOut(doubleElimination(ids(n)));
    const final = ms.find((m) => m.bracket === 'final');
    assert.equal(final.status, 'done');
    const champ = rankedTeams(final)[0];
    assert.equal(champ, 't1');
    const finalLoser = rankedTeams(final)[1];
    const losses = lossCounts(ms);
    for (const t of ids(n)) {
      if (t === champ) assert.ok((losses.get(t) || 0) <= 1);
      else if (t === finalLoser) assert.ok([1, 2].includes(losses.get(t)), `${t} ${losses.get(t)}`);
      else assert.equal(losses.get(t), 2, `${t} has ${losses.get(t)} losses (n=${n})`);
    }
    assert.ok(ms.every((m) => m.status === 'done' || m.status === 'bye'));
  });
}

test('resolveSlots clears a slot again when its feeder loses its result', () => {
  const ms = singleElimination(ids(4), { perMatch: 2 });
  playOut(ms);
  const r1 = ms[0];
  r1.results = [];
  r1.status = 'ready';
  ms.at(-1).results = [];
  ms.at(-1).status = 'waiting';
  resolveSlots(ms);
  assert.equal(ms.at(-1).status, 'waiting');
  assert.equal(ms.at(-1).slots[0].team, null);
});
