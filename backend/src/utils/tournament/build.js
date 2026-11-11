// Checks an event's settings and generates its teams and matches. Pure; no database.
import { TournamentError, rankPlayers, formTeams, teamSeeds, playersKey, shuffle } from './players.js';
import { roundRobin } from './roundRobin.js';
import { singleElimination, doubleElimination, resolveSlots } from './bracket.js';

export const LIMITS = { maxEntrants: 32, maxRoundRobin: 16, teamName: 24 };
const MODES = ['singles', 'teams'];
const FORMATS = ['none', 'roundRobin', 'single', 'double'];
const RESULT_TYPES = ['points', 'winLoss', 'places'];

const fail = (code, message) => { throw new TournamentError(code, message); };

/** Rules that don't depend on who's playing. */
export const validateConfig = (c) => {
  if (!c || !MODES.includes(c.mode) || !FORMATS.includes(c.format) || ![2, 3, 4].includes(c.teamsPerMatch) || !RESULT_TYPES.includes(c.resultType)) {
    fail('invalid_config', "Those event settings aren't valid.");
  }
  if (c.format === 'none' && c.mode !== 'teams') fail('none_needs_teams', '"Just teams" needs Teams mode.');
  if (c.format === 'double' && c.teamsPerMatch !== 2) fail('double_needs_pairs', 'Double elimination is for matches between 2.');
  if (c.resultType === 'places' && c.teamsPerMatch === 2 && c.format !== 'none') fail('places_needs_multi', 'Finishing places are for matches of 3 or 4.');
  if (c.resultType === 'winLoss' && c.format === 'single' && c.teamsPerMatch === 4) {
    fail('win_loss_needs_two', 'Two teams move on from each match, so record points or places.');
  }
  return c;
};

const toPlayer = (p) => ({ key: p.key, user: p.user, guestOf: p.guestOf, guestIndex: p.guestIndex });

const handTeams = (players, teams) => {
  const byKey = new Map(players.map((p) => [p.key, p]));
  const seen = new Set();
  const out = teams.map((t) => (Array.isArray(t?.players) ? t.players : []).map((k) => {
    const key = String(k);
    if (!byKey.has(key) || seen.has(key)) fail('players_mismatch', 'Every player must be on exactly one team.');
    seen.add(key);
    return byKey.get(key);
  }));
  if (seen.size !== players.length) fail('players_mismatch', 'Every player must be on exactly one team.');
  return out;
};

/**
 * @param {{ players, config, rankingOrder?: string[], rng?: () => number }} args
 *   config: { mode, teamSize?, teamCount?, format, teamsPerMatch, resultType, balanceTeams, buildToFinale,
 *             teams?: [{ name, players: key[] }], seedOrder?: number[] (team indexes, strongest first) }
 * @returns {{ teams: [{ key, name, seed, players }], matches, playersKey }}
 */
export const buildEvent = ({ players, config, rankingOrder = [], rng = Math.random }) => {
  const c = validateConfig(config);
  const weighted = (c.balanceTeams || c.buildToFinale) && rankingOrder.length > 0;
  const ranked = weighted ? rankPlayers(players, rankingOrder, rng) : shuffle(players, rng);

  let groups;
  if (Array.isArray(c.teams) && c.teams.length) groups = handTeams(players, c.teams);
  else if (c.mode === 'singles') groups = ranked.map((p) => [p]);
  else {
    if (players.length < 2) fail('not_enough_players', 'You need at least 2 players.');
    groups = formTeams(c.balanceTeams && weighted ? ranked : shuffle(players, rng), { teamSize: c.teamSize, teamCount: c.teamCount, balance: c.balanceTeams && weighted });
  }

  const n = groups.length;
  if (n < 2) fail('not_enough_players', 'You need at least 2 teams or players.');
  if (n > LIMITS.maxEntrants) fail('too_many_entrants', `An event can have at most ${LIMITS.maxEntrants} teams or players.`);
  if (c.format === 'roundRobin' && n > LIMITS.maxRoundRobin) fail('too_many_for_round_robin', `A round robin can have at most ${LIMITS.maxRoundRobin} teams or players.`);
  if (c.format !== 'none' && c.teamsPerMatch > n) fail('too_few_for_match', 'Not enough teams for that many per match.');

  let seeds;
  if (Array.isArray(c.seedOrder) && c.seedOrder.length === n && new Set(c.seedOrder).size === n && c.seedOrder.every((i) => Number.isInteger(i) && i >= 0 && i < n)) {
    seeds = new Array(n);
    c.seedOrder.forEach((teamIndex, s) => { seeds[teamIndex] = s + 1; });
  } else if (weighted) {
    seeds = teamSeeds(groups, ranked);
  } else {
    seeds = new Array(n);
    shuffle([...Array(n).keys()], rng).forEach((teamIndex, s) => { seeds[teamIndex] = s + 1; });
  }

  const teams = groups.map((g, i) => {
    let name = null;
    if (c.mode === 'teams') {
      name = (typeof c.teams?.[i]?.name === 'string' ? c.teams[i].name.trim() : '') || `Team ${i + 1}`;
      if (name.length > LIMITS.teamName) fail('name_too_long', `Team names can be at most ${LIMITS.teamName} characters.`);
    }
    return { key: `t${i + 1}`, name, seed: seeds[i], players: g.map(toPlayer) };
  });

  const seedOf = (key) => teams.find((t) => t.key === key).seed;
  let matches = [];
  if (c.format === 'roundRobin') {
    matches = roundRobin(teams.map((t) => t.key), { perMatch: c.teamsPerMatch, seedOf, finale: c.buildToFinale && weighted, rng })
      .map((m) => ({ id: `m${m.order}`, round: m.round, order: m.order, bracket: null, advance: null, slots: m.teams.map((team) => ({ team, from: null })), results: [], status: 'ready' }));
  } else if (c.format === 'single' || c.format === 'double') {
    const seeded = [...teams].sort((a, b) => a.seed - b.seed).map((t) => t.key);
    matches = c.format === 'double' ? doubleElimination(seeded) : singleElimination(seeded, { perMatch: c.teamsPerMatch });
    resolveSlots(matches);
  }
  return { teams, matches, playersKey: playersKey(players) };
};
