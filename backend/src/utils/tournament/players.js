// Who is playing in a meetup's tournament, how they're ranked, and how they become teams.
// Pure functions; no database. Spec: docs/specs/2026-11-10-team-tournaments-design.md

export class TournamentError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const str = (v) => (v == null ? '' : String(v));

export const guestKey = (hostClerkId, n) => `guest:${hostClerkId}:${n}`;

/**
 * Players = everyone In (each followed by their guests), then extra players the organizer
 * ticked (Undecided members), minus anyone Out. A host who is Out takes their guests along.
 * `clerkIdOf(userId)` maps a user id to the clerk id that `meetup.guests` is keyed by.
 */
export const collectPlayers = (meetup, { extraPlayers = [], clerkIdOf } = {}) => {
  const out = new Set((meetup.out || []).map(str));
  const guestCount = new Map((meetup.guests || []).map((g) => [str(g.userId), Number(g.count) || 0]));
  const seen = new Set();
  const players = [];
  const addUser = (id) => {
    if (!id || out.has(id) || seen.has(id)) return false;
    seen.add(id);
    players.push({ key: id, user: id, guestOf: null, guestIndex: null });
    return true;
  };
  for (const raw of meetup.in || []) {
    const id = str(raw);
    if (!addUser(id)) continue;
    const clerkId = clerkIdOf ? clerkIdOf(id) : null;
    const n = clerkId ? guestCount.get(str(clerkId)) || 0 : 0;
    for (let i = 1; i <= n; i++) {
      players.push({ key: guestKey(clerkId, i), user: null, guestOf: str(clerkId), guestIndex: i });
    }
  }
  for (const raw of extraPlayers) addUser(str(raw));
  return players;
};

export const playersKey = (players) => players.map((p) => p.key).sort().join(',');

/** Small deterministic random generator (mulberry32): the same seed always gives the same numbers. */
export const seededRng = (seed) => {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const shuffle = (arr, rng = Math.random) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Players on the ranking list come first in list order; everyone else follows, shuffled. */
export const rankPlayers = (players, order = [], rng = Math.random) => {
  const byKey = new Map(players.map((p) => [p.key, p]));
  const ranked = [];
  const used = new Set();
  for (const raw of order) {
    const p = byKey.get(str(raw));
    if (p && !used.has(p.key)) { ranked.push(p); used.add(p.key); }
  }
  return [...ranked, ...shuffle(players.filter((p) => !used.has(p.key)), rng)];
};

/**
 * Split players (already in rank or random order) into teams. Give `teamSize` or `teamCount`.
 * - By number of teams: leftover players are spread so sizes differ by at most one.
 * - By team size: when players don't divide evenly, the leftover players each play on their own
 *   team, taken from the top of `topOrder` (the ranking, or a random order; defaults to `players`).
 *   Those solo teams come first.
 * `balance` snake-drafts (1→N, then N→1); otherwise players are dealt in order.
 */
export const formTeams = (players, { teamSize, teamCount, balance = false, topOrder } = {}) => {
  const n = players.length;
  if (!(Number.isInteger(teamCount) && teamCount > 0) && Number.isInteger(teamSize) && teamSize > 0) {
    const leftover = n % teamSize;
    const soloKeys = new Set((topOrder || players).slice(0, leftover).map((p) => p.key));
    const solos = (topOrder || players).filter((p) => soloKeys.has(p.key)).map((p) => [p]);
    const rest = players.filter((p) => !soloKeys.has(p.key));
    const full = rest.length ? dealTeams(rest, rest.length / teamSize, balance) : [];
    return [...solos, ...full];
  }
  if (!(Number.isInteger(teamCount) && teamCount > 0)) {
    throw new TournamentError('team_size_required', 'Choose a team size or a number of teams.');
  }
  if (teamCount > n) throw new TournamentError('too_many_teams', 'Not enough players for that many teams.');
  return dealTeams(players, teamCount, balance);
};

const dealTeams = (players, count, balance) => {
  const teams = Array.from({ length: count }, () => []);
  players.forEach((p, i) => {
    let t = i % count;
    if (balance && Math.floor(i / count) % 2 === 1) t = count - 1 - t;
    teams[t].push(p);
  });
  return teams;
};

/** Seed per team (1 = strongest) from the players' positions in `ranked`. */
export const teamSeeds = (teams, ranked) => {
  const rankOf = new Map(ranked.map((p, i) => [p.key, i + 1]));
  const worst = ranked.length + 1;
  const info = teams.map((t, i) => {
    const ranks = t.map((p) => rankOf.get(p.key) ?? worst);
    const avg = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : worst;
    return { i, avg, best: ranks.length ? Math.min(...ranks) : worst };
  });
  const order = [...info].sort((a, b) => a.avg - b.avg || a.best - b.best || a.i - b.i);
  const seeds = new Array(teams.length);
  order.forEach((x, s) => { seeds[x.i] = s + 1; });
  return seeds;
};
