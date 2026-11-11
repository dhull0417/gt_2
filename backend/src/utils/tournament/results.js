// Recording match results, clearing what a correction invalidates, standings and champion.
// Pure functions over a plain tournament object; no database.
import { TournamentError } from './players.js';
import { resolveSlots, rankedTeams } from './bracket.js';

const isBracket = (t) => t.format === 'single' || t.format === 'double';
const teamsIn = (m) => m.slots.map((s) => s.team).filter(Boolean).map(String);
const bad = (msg) => new TournamentError('invalid_result', msg || "That result doesn't fit this match.");
const tieErr = () => new TournamentError('tie_not_allowed', 'A bracket match needs a clear winner.');

/** Places where equal values share a place (1 + number strictly better). */
const placesFromScores = (teams, scoreOf) =>
  teams.map((team) => ({ team, place: 1 + teams.filter((o) => scoreOf(o) > scoreOf(team)).length }));

/**
 * Turn a reported body into `[{ team, place, points? }]`, sorted by place.
 * points `{ scores: { [team]: int 0-999 } }` · winLoss `{ winner: team|null }` · places `{ order: team[] }`.
 * When ties aren't allowed (brackets), the teams advancing (`match.advance`, default 1) must be clear.
 */
export const normalizeResult = (match, resultType, body = {}, { allowTie = true } = {}) => {
  const teams = teamsIn(match);
  let results;
  if (resultType === 'points') {
    const scores = body.scores;
    if (!scores || typeof scores !== 'object') throw bad();
    const keys = Object.keys(scores);
    if (keys.length !== teams.length || !teams.every((t) => keys.includes(t))) throw bad('Enter a score for every team.');
    for (const t of teams) {
      const v = scores[t];
      if (!Number.isInteger(v) || v < 0 || v > 999) throw bad('Scores are whole numbers from 0 to 999.');
    }
    results = placesFromScores(teams, (t) => scores[t]).map((r) => ({ ...r, points: scores[r.team] }));
  } else if (resultType === 'winLoss') {
    const w = body.winner == null ? null : String(body.winner);
    if (w !== null && !teams.includes(w)) throw bad('Pick a team from this match.');
    results = teams.map((team) => ({ team, place: w === null ? 1 : team === w ? 1 : 2 }));
  } else if (resultType === 'places') {
    const order = Array.isArray(body.order) ? body.order.map(String) : null;
    if (!order || order.length !== teams.length || new Set(order).size !== teams.length || !order.every((t) => teams.includes(t))) {
      throw bad('Put every team in a finishing place.');
    }
    results = order.map((team, i) => ({ team, place: i + 1 }));
  } else {
    throw bad();
  }
  results.sort((a, b) => a.place - b.place || teams.indexOf(a.team) - teams.indexOf(b.team));
  if (!allowTie) {
    const adv = match.advance ?? 1;
    if (results.filter((r) => r.place <= adv).length !== adv) throw tieErr();
  } else if (resultType === 'winLoss' && teams.length > 2 && body.winner == null) {
    throw tieErr();
  }
  return results;
};

/** What a finished match hands to each slot that it feeds. */
const outputsOf = (t, match) => {
  const ranked = rankedTeams(match);
  return t.matches.flatMap((m) => m.slots.filter((s) => s.from?.match === match.id))
    .map((s) => (s.from.loser ? ranked[1] : ranked[s.from.place - 1]) ?? null);
};

/** Every match fed (directly or indirectly) by `matchId`. */
const downstream = (t, matchId) => {
  const out = [];
  const queue = [matchId];
  while (queue.length) {
    const id = queue.shift();
    for (const m of t.matches) {
      if (!out.includes(m) && m.slots.some((s) => s.from?.match === id)) { out.push(m); queue.push(m.id); }
    }
  }
  return out;
};

const finishedAll = (t) => t.matches.length > 0 && t.matches.every((m) => m.status === 'done' || m.status === 'bye');

/**
 * Record a result. Mutates `t` (matches, status, champion).
 * @returns {{ cleared: string[], newlyReady: string[], finished: boolean, championChanged: boolean }}
 */
export const applyResult = (t, matchId, body, { isManager = false } = {}) => {
  const match = t.matches.find((m) => m.id === matchId);
  if (!match) throw new TournamentError('match_not_found', 'That match no longer exists.');
  if (match.status !== 'ready' && match.status !== 'done') throw new TournamentError('not_ready', "This match isn't ready yet.");
  const results = normalizeResult(match, t.resultType, body, { allowTie: t.format === 'roundRobin' });

  let cleared = [];
  if (isBracket(t)) {
    const before = outputsOf(t, match);
    const after = outputsOf(t, { ...match, results, status: 'done' });
    const changed = before.some((v, i) => v !== after[i]);
    const later = downstream(t, match.id).filter((m) => m.results?.length);
    if (changed && later.length) {
      if (!isManager) throw new TournamentError('locked', 'Only an owner or moderator can change this now.');
      for (const m of later) { m.results = []; m.status = 'waiting'; }
      cleared = later.map((m) => m.id);
    }
  }
  match.results = results;
  match.status = 'done';
  const { newlyReady } = isBracket(t) ? resolveSlots(t.matches) : { newlyReady: [] };

  const prevChampion = t.champion ? String(t.champion) : null;
  const finished = finishedAll(t);
  t.status = finished ? 'finished' : 'active';
  t.champion = finished ? championOf(t) : null;
  return { cleared, newlyReady, finished, championChanged: (t.champion ? String(t.champion) : null) !== prevChampion };
};

/** Points a team earns from one finished match (round robin). */
const matchScore = (t, m, team) => {
  const r = m.results.find((x) => String(x.team) === team);
  const k = m.results.length;
  if (k === 2 || t.resultType === 'winLoss') {
    if (r.place !== 1) return 0;
    return m.results.filter((x) => x.place === 1).length > 1 ? 0.5 : 1;
  }
  return k - r.place;
};

/** Round-robin standings, best first: score → head-to-head → point difference → seed. */
export const standings = (t) => {
  const rows = new Map(t.teams.map((tm) => [String(tm.key ?? tm._id), {
    team: String(tm.key ?? tm._id), seed: tm.seed ?? 999, played: 0, wins: 0, losses: 0, ties: 0, score: 0, pointsFor: 0, pointDiff: 0,
  }]));
  const done = t.matches.filter((m) => m.status === 'done' && m.results?.length);
  for (const m of done) {
    const firsts = m.results.filter((x) => x.place === 1).length;
    for (const r of m.results) {
      const row = rows.get(String(r.team));
      if (!row) continue;
      row.played++;
      if (r.place === 1 && firsts === 1) row.wins++;
      else if (r.place === 1) row.ties++;
      else row.losses++;
      row.score += matchScore(t, m, String(r.team));
      if (t.resultType === 'points') {
        const others = m.results.filter((x) => x !== r);
        const against = others.reduce((n, x) => n + (x.points || 0), 0) / Math.max(1, others.length);
        row.pointsFor += r.points || 0;
        row.pointDiff += (r.points || 0) - against;
      }
    }
  }
  const list = [...rows.values()];
  const h2h = (team, group) => {
    let n = 0;
    for (const m of done) {
      const mine = m.results.find((x) => String(x.team) === team);
      if (!mine) continue;
      for (const o of m.results) {
        const ot = String(o.team);
        if (ot === team || !group.includes(ot)) continue;
        n += mine.place < o.place ? 1 : mine.place > o.place ? -1 : 0;
      }
    }
    return n;
  };
  list.sort((a, b) => b.score - a.score);
  const out = [];
  for (let i = 0; i < list.length;) {
    let j = i;
    while (j < list.length && list[j].score === list[i].score) j++;
    const group = list.slice(i, j);
    const names = group.map((r) => r.team);
    group.forEach((r) => { r.h2h = group.length > 1 ? h2h(r.team, names) : 0; });
    group.sort((a, b) => b.h2h - a.h2h || b.pointDiff - a.pointDiff || a.seed - b.seed);
    out.push(...group);
    i = j;
  }
  return out.map(({ h2h: _h, seed: _s, ...r }) => ({ ...r, pointDiff: Math.round(r.pointDiff * 10) / 10 }));
};

export const championOf = (t) => {
  if (!t.matches?.length) return null;
  if (t.format === 'roundRobin') return finishedAll(t) ? standings(t)[0]?.team ?? null : null;
  const final = t.matches.at(-1);
  return final.status === 'done' || final.status === 'bye' ? rankedTeams(final)[0] ?? null : null;
};
