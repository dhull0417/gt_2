import {
  allowedFormats, allowedResultTypes, fixConfig, playerLabel, teamLabel, myTeam, myNextMatch, canReport,
  roundsOf, bracketColumns, resultLine, matchTitle,
} from '../tournament';
import type { Tournament, TMatch } from '../tournamentApi';

const P = (user: string) => ({ key: user, user, guestOf: null, guestIndex: null });
const G = (host: string, n: number) => ({ key: `guest:${host}:${n}`, user: null, guestOf: host, guestIndex: n });
const M = (id: string, teams: (string | null)[], over: Partial<TMatch> = {}): TMatch => ({
  id, round: 1, order: Number(id.slice(1)), bracket: null, advance: null,
  slots: teams.map((team) => ({ team, from: null })), results: [], status: 'ready', ...over,
});

const base = (over: Partial<Tournament> = {}): Tournament => ({
  _id: 'T', group: 'g', meetup: 'm', meetupStartsAt: null, status: 'active', mode: 'teams', format: 'roundRobin',
  teamsPerMatch: 2, resultType: 'points', teamSize: 2, teamCount: null,
  weighting: { listId: null, order: [], balanceTeams: false, buildToFinale: false }, extraPlayers: [], playersKey: '',
  teams: [
    { key: 't1', name: 'Reds', seed: 1, players: [P('a'), G('cA', 2)] },
    { key: 't2', name: null, seed: 2, players: [P('b'), P('gone')] },
    { key: 't3', name: 'Greens', seed: 3, players: [P('c')] },
  ],
  matches: [
    M('m1', ['t1', 't2'], { status: 'done', results: [{ team: 't2', place: 1, points: 11 }, { team: 't1', place: 2, points: 7 }] }),
    M('m2', ['t1', 't3'], { round: 2 }),
    M('m3', ['t2', 't3'], { round: 3 }),
  ],
  champion: null,
  people: { a: { firstName: 'Ana' }, b: { firstName: 'Ben' }, c: { firstName: 'Cy' } },
  hosts: { cA: { firstName: 'Ana' } },
  standings: null,
  canManage: false,
  ...over,
});

describe('setup rules', () => {
  test('double elimination only for matches of 2; just teams only in Teams mode', () => {
    expect(allowedFormats('singles', 2)).toEqual(['roundRobin', 'single', 'double']);
    expect(allowedFormats('singles', 3)).toEqual(['roundRobin', 'single']);
    expect(allowedFormats('teams', 2)).toEqual(['none', 'roundRobin', 'single', 'double']);
  });
  test('places only for 3-4 per match; win/loss not for a 4-per-match bracket', () => {
    expect(allowedResultTypes('roundRobin', 2)).toEqual(['points', 'winLoss']);
    expect(allowedResultTypes('roundRobin', 4)).toEqual(['points', 'winLoss', 'places']);
    expect(allowedResultTypes('single', 4)).toEqual(['points', 'places']);
    expect(allowedResultTypes('none', 2)).toEqual([]);
  });
  test('fixConfig moves a choice that is no longer allowed to the first allowed one', () => {
    const c = fixConfig({ mode: 'singles', format: 'double', teamsPerMatch: 4, resultType: 'winLoss', balanceTeams: true, buildToFinale: false });
    expect(c.format).toBe('roundRobin');
    expect(c.resultType).toBe('winLoss');
    expect(c.balanceTeams).toBe(false);
    expect(fixConfig({ mode: 'teams', format: 'single', teamsPerMatch: 4, resultType: 'winLoss', balanceTeams: false, buildToFinale: false }).resultType).toBe('points');
    expect(fixConfig({ mode: 'singles', format: 'none', teamsPerMatch: 2, resultType: 'points', balanceTeams: false, buildToFinale: false }).format).toBe('roundRobin');
  });
});

describe('labels', () => {
  const t = base();
  test('players, guests and former members', () => {
    expect(playerLabel(t, P('a'))).toBe('Ana');
    expect(playerLabel(t, G('cA', 1))).toBe("Ana's guest");
    expect(playerLabel(t, G('cA', 2))).toBe("Ana's guest 2");
    expect(playerLabel(t, P('gone'))).toBe('Former member');
    expect(playerLabel(t, P('a'), 'a')).toBe('You');
  });
  test('teams use their name, else their players', () => {
    expect(teamLabel(t, 't1')).toBe('Reds');
    expect(teamLabel(t, 't2')).toBe('Ben & Former member');
    expect(teamLabel(t, null)).toBe('TBD');
    expect(matchTitle(t, t.matches[1])).toBe('Reds vs Greens');
  });
  test('result lines', () => {
    expect(resultLine(t, t.matches[0])).toBe('Ben & Former member 11 – 7 Reds');
    expect(resultLine(base({ resultType: 'winLoss' }), { ...t.matches[0], results: [{ team: 't2', place: 1 }, { team: 't1', place: 2 }] })).toBe('Ben & Former member won');
    expect(resultLine(base({ resultType: 'winLoss' }), { ...t.matches[0], results: [{ team: 't2', place: 1 }, { team: 't1', place: 1 }] })).toBe('Tie');
    expect(resultLine(base({ resultType: 'places' }), M('m9', ['t1', 't2', 't3'], { status: 'done', results: [{ team: 't3', place: 1 }, { team: 't1', place: 2 }, { team: 't2', place: 3 }] })))
      .toBe('1. Greens  2. Reds  3. Ben & Former member');
    expect(resultLine(t, t.matches[1])).toBe('');
  });
});

describe('me', () => {
  const t = base();
  test('my team and next match skip finished matches and byes', () => {
    expect(myTeam(t, 'a')?.key).toBe('t1');
    expect(myTeam(t, 'zz')).toBeNull();
    expect(myNextMatch(t, 'a')?.id).toBe('m2');
    const withBye = base({ matches: [M('m1', ['t1'], { status: 'bye' }), M('m2', ['t1', 't3'], { status: 'waiting' }), M('m3', ['t1', 't2'])] });
    expect(myNextMatch(withBye, 'a')?.id).toBe('m3');
    expect(myNextMatch(t, 'zz')).toBeNull();
  });
  test('who can report: players in the match (not guests), or a manager; never byes or waiting matches', () => {
    expect(canReport(t, t.matches[1], 'a')).toBe(true);
    expect(canReport(t, t.matches[2], 'a')).toBe(false);
    expect(canReport(base({ canManage: true }), t.matches[2], 'a')).toBe(true);
    expect(canReport(t, t.matches[0], 'b')).toBe(true);
    expect(canReport(t, M('m5', ['t1', 't2'], { status: 'waiting' }), 'a')).toBe(false);
    expect(canReport(base({ canManage: true }), M('m5', ['t1'], { status: 'bye' }), 'a')).toBe(false);
  });
});

describe('grouping', () => {
  test('round robin rounds', () => {
    expect(roundsOf(base()).map((r) => [r.title, r.matches.map((m) => m.id)])).toEqual([['Round 1', ['m1']], ['Round 2', ['m2']], ['Round 3', ['m3']]]);
  });
  test('bracket sections and columns', () => {
    const t = base({
      format: 'double',
      matches: [
        M('m1', ['t1', 't2'], { bracket: 'winners', round: 1 }), M('m2', ['t3', null], { bracket: 'winners', round: 1, status: 'bye' }),
        M('m3', [null, null], { bracket: 'winners', round: 2, status: 'waiting' }), M('m4', [null, null], { bracket: 'losers', round: 1, status: 'waiting' }),
        M('m5', [null, null], { bracket: 'final', round: 1, status: 'waiting' }),
      ],
    });
    expect(roundsOf(t).map((r) => r.title)).toEqual(['Round 1', 'Round 2', 'Losers round 1', 'Final']);
    const cols = bracketColumns(t);
    expect(cols.winners.map((c) => c.map((m) => m.id))).toEqual([['m1', 'm2'], ['m3']]);
    expect(cols.losers.map((c) => c.map((m) => m.id))).toEqual([['m4']]);
    expect(cols.final.map((m) => m.id)).toEqual(['m5']);
  });
  test('single elimination names its last round Final', () => {
    const t = base({ format: 'single', matches: [M('m1', ['t1', 't2']), M('m2', ['t3', null], { status: 'bye' }), M('m3', [null, null], { round: 2, status: 'waiting' })] });
    expect(roundsOf(t).map((r) => r.title)).toEqual(['Round 1', 'Final']);
  });
});
