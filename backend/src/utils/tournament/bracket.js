// Seeded brackets with byes. Single elimination supports 2, 3 or 4 teams per match (the top
// half of each match advances: 2→1, 3→1, 4→2); double elimination is 2 per match only, with a
// single grand final (no reset). Pure functions; no database.
//
// Match = { id, round, bracket: 'winners'|'losers'|'final'|null, order, advance,
//           slots: [{ team, from: { match, place } | { match, loser: true } | null }],
//           results: [{ team, place, points? }], status: 'waiting'|'ready'|'done'|'bye' }
// `matches` is always in an order where every feeder comes before the match it feeds.

export const advanceFor = (perMatch) => (perMatch === 4 ? 2 : 1);

/** Teams in finishing order: by recorded place, or for a bye by slot (seed) order. */
export const rankedTeams = (m) => {
  if (m.results?.length) return [...m.results].sort((a, b) => a.place - b.place).map((r) => String(r.team));
  if (m.status === 'bye') return m.slots.map((s) => s.team).filter(Boolean).map(String);
  return [];
};

const isFinished = (m) => m.status === 'done' || m.status === 'bye';

/** Fill slots from finished feeders, mark byes and ready matches. Mutates and returns. */
export const resolveSlots = (matches) => {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const newlyReady = [];
  for (const m of matches) {
    let settled = true;
    for (const s of m.slots) {
      if (!s.from) continue;
      const f = byId.get(s.from.match);
      if (f && isFinished(f)) {
        const ranked = rankedTeams(f);
        s.team = (s.from.loser ? ranked[1] : ranked[s.from.place - 1]) ?? null;
      } else {
        s.team = null;
        settled = false;
      }
    }
    if (m.results?.length) { m.status = 'done'; continue; }
    if (!settled) { m.status = 'waiting'; continue; }
    const real = m.slots.filter((s) => s.team).length;
    if (real <= (m.advance ?? 1)) {
      m.status = 'bye';
    } else {
      if (m.status !== 'ready') newlyReady.push(m.id);
      m.status = 'ready';
    }
  }
  return { matches, newlyReady };
};

const snakeSplit = (seeds, groups) => {
  const out = Array.from({ length: groups }, () => []);
  seeds.forEach((s, i) => {
    const pass = Math.floor(i / groups);
    const pos = i % groups;
    out[pass % 2 === 0 ? pos : groups - 1 - pos].push(s);
  });
  return out;
};

/** Seed sets for every match, level by level from the final (level R) down to round 1. */
const seedTree = (n, k, a) => {
  const g = k / a;
  let R = 1;
  while (k * g ** (R - 1) < n) R++;
  const levels = new Array(R + 1);
  levels[R] = [Array.from({ length: k }, (_, i) => i + 1)];
  for (let L = R; L > 1; L--) {
    const children = [];
    for (const seeds of levels[L]) for (const part of snakeSplit([...seeds].sort((x, y) => x - y), g)) children.push(part);
    const protectedCount = children.length * a;
    const remaining = [];
    for (let s = children.length * k; s > protectedCount; s--) remaining.push(s);
    const byStrength = [...children].sort((x, y) => Math.min(...x) - Math.min(...y));
    let pass = 0;
    while (remaining.length) {
      const order = pass % 2 === 0 ? byStrength : [...byStrength].reverse();
      for (const c of order) if (remaining.length) c.push(remaining.shift());
      pass++;
    }
    levels[L - 1] = children.map((c) => [...c].sort((x, y) => x - y));
  }
  return { levels, R, g };
};

const makeMatch = (round, bracket, advance, slots) => ({ id: null, round, bracket, order: 0, advance, slots, results: [], status: 'waiting' });

const finalize = (list) => {
  list.forEach((m, i) => { m.order = i + 1; m.id = `m${i + 1}`; });
  // Rewrite feeder references from objects to ids.
  for (const m of list) for (const s of m.slots) if (s.from?.matchRef) s.from = { ...s.from, match: s.from.matchRef.id, matchRef: undefined };
  for (const m of list) for (const s of m.slots) if (s.from && 'matchRef' in s.from) delete s.from.matchRef;
  return list;
};

/** Single-elimination matches (round 1 first). Returns raw matches whose feeders are objects. */
const buildSingle = (seeded, k, bracket) => {
  const a = advanceFor(k);
  const { levels, R, g } = seedTree(seeded.length, k, a);
  const teamAt = (seed) => (seed <= seeded.length ? String(seeded[seed - 1]) : null);
  const byLevel = [];
  byLevel[1] = levels[1].map((seeds) => makeMatch(1, bracket, a, seeds.map((s) => ({ team: teamAt(s), from: null }))));
  for (let L = 2; L <= R; L++) {
    byLevel[L] = levels[L].map((_, p) => {
      const slots = [];
      for (let c = 0; c < g; c++) {
        const child = byLevel[L - 1][p * g + c];
        for (let place = 1; place <= a; place++) slots.push({ team: null, from: { matchRef: child, place } });
      }
      return makeMatch(L, bracket, L === R ? 1 : a, slots);
    });
  }
  if (R === 1) byLevel[1][0].advance = 1;
  return { list: byLevel.slice(1).flat(), byLevel, R };
};

/**
 * @param {string[]} seededTeamIds strongest first
 * @param {{ perMatch: 2|3|4 }} opts
 */
export const singleElimination = (seededTeamIds, { perMatch = 2 } = {}) => {
  const { list } = buildSingle(seededTeamIds, perMatch, null);
  return finalize(list);
};

/** Double elimination, 2 per match, with a single grand final. */
export const doubleElimination = (seededTeamIds) => {
  const { list: wb, byLevel, R: w } = buildSingle(seededTeamIds, 2, 'winners');
  wb.forEach((m) => { m.advance = 1; });
  const lb = [];
  const loserOf = (m) => ({ team: null, from: { matchRef: m, loser: true } });
  const winnerOf = (m) => ({ team: null, from: { matchRef: m, place: 1 } });
  let lbRound = 0;
  let current = []; // LB matches whose winners are still alive, in bracket order
  if (w >= 2) {
    lbRound++;
    const losers = byLevel[1];
    for (let i = 0; i < losers.length; i += 2) {
      const m = makeMatch(lbRound, 'losers', 1, [loserOf(losers[i]), loserOf(losers[i + 1])]);
      lb.push(m);
      current.push(m);
    }
    for (let wr = 2; wr <= w; wr++) {
      // Drop round: LB survivors meet this WB round's losers (reversed on alternate rounds to avoid rematches).
      lbRound++;
      const dropping = wr % 2 === 0 ? [...byLevel[wr]].reverse() : byLevel[wr];
      current = current.map((prev, i) => {
        const m = makeMatch(lbRound, 'losers', 1, [winnerOf(prev), loserOf(dropping[i])]);
        lb.push(m);
        return m;
      });
      if (wr < w) {
        lbRound++;
        const next = [];
        for (let i = 0; i < current.length; i += 2) {
          const m = makeMatch(lbRound, 'losers', 1, [winnerOf(current[i]), winnerOf(current[i + 1])]);
          lb.push(m);
          next.push(m);
        }
        current = next;
      }
    }
  }
  const wbFinal = byLevel[w][0];
  const final = makeMatch(1, 'final', 1, [winnerOf(wbFinal), current.length ? winnerOf(current[0]) : loserOf(wbFinal)]);
  return finalize([...wb, ...lb, final]);
};
