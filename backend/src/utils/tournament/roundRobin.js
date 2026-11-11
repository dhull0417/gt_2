// Round-robin schedules. Two teams per match: the circle method (every pair meets once).
// Three or four per match: a greedy cover where every pair meets at least once and match
// counts per team differ by at most one. Pure functions; no database.
import { shuffle } from './players.js';

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Lexicographic: is score a better than score b (higher wins at the first difference)? */
const isBetter = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};

const circleRounds =(teams) => {
  const list = teams.length % 2 ? [...teams, null] : [...teams];
  const n = list.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a != null && b != null) round.push([a, b]);
    }
    rounds.push(round);
    list.splice(1, 0, list.pop()); // rotate everything but the first
  }
  return rounds;
};

const cover = (teams, k) => {
  const idx = new Map(teams.map((t, i) => [t, i]));
  const unmet = new Set();
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) unmet.add(pairKey(teams[i], teams[j]));
  const played = new Map(teams.map((t) => [t, 0]));
  const unmetCount = (t) => teams.reduce((n, o) => n + (o !== t && unmet.has(pairKey(t, o)) ? 1 : 0), 0);
  const matches = [];
  const add = (group) => {
    matches.push(group);
    for (const t of group) played.set(t, played.get(t) + 1);
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) unmet.delete(pairKey(group[i], group[j]));
  };
  while (unmet.size) {
    const open = teams.filter((t) => unmetCount(t) > 0);
    open.sort((a, b) => played.get(a) - played.get(b) || unmetCount(b) - unmetCount(a) || idx.get(a) - idx.get(b));
    const group = [open[0]];
    while (group.length < k) {
      let best = null;
      let bestScore = null;
      for (const t of teams) {
        if (group.includes(t)) continue;
        const gain = group.reduce((n, g) => n + (unmet.has(pairKey(g, t)) ? 1 : 0), 0);
        const score = [gain, -played.get(t), unmetCount(t), -idx.get(t)];
        if (!bestScore || isBetter(score, bestScore)) {
          best = t;
          bestScore = score;
        }
      }
      group.push(best);
    }
    add(group);
  }
  // Even out the number of matches each team plays.
  for (let guard = 0; guard < teams.length * 4; guard++) {
    const counts = teams.map((t) => played.get(t));
    if (Math.max(...counts) - Math.min(...counts) <= 1) break;
    const low = [...teams].sort((a, b) => played.get(a) - played.get(b) || idx.get(a) - idx.get(b));
    add(low.slice(0, k));
  }
  return matches;
};

/** Group matches (in priority order) into rounds where nobody plays twice. */
const packRounds = (groups) => {
  const remaining = [...groups];
  const out = [];
  let round = 0;
  while (remaining.length) {
    round++;
    const busy = new Set();
    for (let i = 0; i < remaining.length;) {
      const g = remaining[i];
      if (g.some((t) => busy.has(t))) { i++; continue; }
      g.forEach((t) => busy.add(t));
      out.push({ round, teams: g });
      remaining.splice(i, 1);
    }
  }
  return out;
};

/**
 * @param {string[]} teamIds
 * @param {{ perMatch: number, seedOf?: (id: string) => number, finale?: boolean, rng?: () => number }} opts
 * @returns {{ round: number, order: number, teams: string[] }[]}
 */
export const roundRobin = (teamIds, { perMatch = 2, seedOf, finale = false, rng = Math.random } = {}) => {
  const teams = finale ? [...teamIds] : shuffle(teamIds, rng);
  let groups;
  if (perMatch === 2) groups = circleRounds(teams).flat();
  else groups = cover(teams, perMatch);

  let scheduled;
  if (finale && seedOf) {
    const spread = (g) => Math.max(...g.map(seedOf)) - Math.min(...g.map(seedOf));
    const sum = (g) => g.reduce((n, t) => n + seedOf(t), 0);
    const sorted = [...groups].sort((a, b) => spread(b) - spread(a) || sum(b) - sum(a));
    const last = sorted.pop();
    scheduled = packRounds(sorted);
    const lastRound = scheduled.length ? scheduled.at(-1).round : 0;
    const busy = new Set(scheduled.filter((m) => m.round === lastRound).flatMap((m) => m.teams));
    scheduled.push({ round: lastRound && !last.some((t) => busy.has(t)) ? lastRound : lastRound + 1, teams: last });
  } else if (perMatch === 2) {
    // Keep the circle method's rounds (fewest rounds possible).
    scheduled = [];
    circleRounds(teams).forEach((r, i) => r.forEach((g) => scheduled.push({ round: i + 1, teams: g })));
  } else {
    scheduled = packRounds(groups);
  }
  return scheduled.map((m, i) => ({ round: m.round, order: i + 1, teams: m.teams }));
};
