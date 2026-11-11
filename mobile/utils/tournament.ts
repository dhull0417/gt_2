// Read-side helpers for teams & tournaments (setup rules, labels, my team, grouping).
// The server owns every rule that changes data: backend/src/utils/tournament/.
import type { Tournament, TMatch, TMode, TFormat, TResultType, TPlayer, TTeam, TournamentConfig } from './tournamentApi';

export const FORMAT_LABEL: Record<TFormat, string> = {
  none: 'Just teams', roundRobin: 'Round robin', single: 'Bracket: single elimination', double: 'Bracket: double elimination',
};
export const RESULT_LABEL: Record<TResultType, string> = { points: 'Points', winLoss: 'Win / loss', places: 'Finishing places' };

export const allowedFormats = (mode: TMode, perMatch: number): TFormat[] => {
  const list: TFormat[] = mode === 'teams' ? ['none', 'roundRobin', 'single'] : ['roundRobin', 'single'];
  if (perMatch === 2) list.push('double');
  return list;
};

export const allowedResultTypes = (format: TFormat, perMatch: number): TResultType[] => {
  if (format === 'none') return [];
  if (perMatch === 2) return ['points', 'winLoss'];
  if (perMatch === 4 && format === 'single') return ['points', 'places'];
  return ['points', 'winLoss', 'places'];
};

/** Keep a config valid as the organizer changes one setting at a time. */
export const fixConfig = (c: TournamentConfig): TournamentConfig => {
  const next = { ...c };
  const formats = allowedFormats(next.mode, next.teamsPerMatch);
  if (!formats.includes(next.format)) next.format = formats.find((f) => f !== 'none') ?? formats[0];
  const types = allowedResultTypes(next.format, next.teamsPerMatch);
  if (types.length && !types.includes(next.resultType)) next.resultType = types[0];
  if (next.mode === 'singles') next.balanceTeams = false;
  return next;
};

export const playerLabel = (t: Pick<Tournament, 'people' | 'hosts'>, p: TPlayer, meId?: string): string => {
  if (p.user) {
    if (meId && p.user === meId) return 'You';
    return t.people[p.user]?.firstName?.trim() || 'Former member';
  }
  const host = (p.guestOf && t.hosts[p.guestOf]?.firstName?.trim()) || 'Someone';
  return (p.guestIndex ?? 1) > 1 ? `${host}'s guest ${p.guestIndex}` : `${host}'s guest`;
};

export const teamByKey = (t: Tournament, key: string | null): TTeam | null => (key ? t.teams.find((x) => x.key === key) ?? null : null);

export const teamLabel = (t: Tournament, key: string | null, meId?: string): string => {
  const team = teamByKey(t, key);
  if (!team) return 'TBD';
  return team.name || team.players.map((p) => playerLabel(t, p, meId)).join(' & ');
};

export const matchTitle = (t: Tournament, m: TMatch, meId?: string) => m.slots.map((s) => teamLabel(t, s.team, meId)).join(' vs ');

export const resultLine = (t: Tournament, m: TMatch): string => {
  if (!m.results?.length) return '';
  const r = [...m.results].sort((a, b) => a.place - b.place);
  if (t.resultType === 'points') {
    if (r.length === 2) return `${teamLabel(t, r[0].team)} ${r[0].points ?? 0} – ${r[1].points ?? 0} ${teamLabel(t, r[1].team)}`;
    return r.map((x) => `${x.place}. ${teamLabel(t, x.team)} ${x.points ?? 0}`).join('  ');
  }
  if (t.resultType === 'winLoss') {
    const firsts = r.filter((x) => x.place === 1);
    return firsts.length > 1 ? 'Tie' : `${teamLabel(t, firsts[0].team)} won`;
  }
  return r.map((x) => `${x.place}. ${teamLabel(t, x.team)}`).join('  ');
};

export const myTeam = (t: Tournament, userId: string): TTeam | null =>
  t.teams.find((team) => team.players.some((p) => p.user === userId)) ?? null;

const hasTeam = (m: TMatch, key: string) => m.slots.some((s) => s.team === key);

export const myNextMatch = (t: Tournament, userId: string): TMatch | null => {
  const mine = myTeam(t, userId);
  if (!mine) return null;
  return [...t.matches].sort((a, b) => a.order - b.order).find((m) => m.status === 'ready' && hasTeam(m, mine.key)) ?? null;
};

export const canReport = (t: Tournament, m: TMatch, userId: string): boolean => {
  if (m.status !== 'ready' && m.status !== 'done') return false;
  if (t.canManage) return true;
  return m.slots.some((s) => teamByKey(t, s.team)?.players.some((p) => p.user === userId));
};

export interface RoundSection { key: string; title: string; matches: TMatch[] }

/** Matches grouped for the Matches tab, in play order. */
export const roundsOf = (t: Tournament): RoundSection[] => {
  const sorted = [...t.matches].sort((a, b) => a.order - b.order);
  const sections: RoundSection[] = [];
  const lastWinnersRound = Math.max(0, ...sorted.filter((m) => m.bracket !== 'losers' && m.bracket !== 'final').map((m) => m.round));
  const titleOf = (m: TMatch) => {
    if (m.bracket === 'final') return 'Final';
    if (m.bracket === 'losers') return `Losers round ${m.round}`;
    if (t.format === 'single' && m.round === lastWinnersRound && lastWinnersRound > 1) return 'Final';
    if (t.format === 'single' && lastWinnersRound === 1) return 'Final';
    return `Round ${m.round}`;
  };
  for (const m of sorted) {
    const key = `${m.bracket ?? 'main'}:${m.round}`;
    let s = sections.find((x) => x.key === key);
    if (!s) { s = { key, title: titleOf(m), matches: [] }; sections.push(s); }
    s.matches.push(m);
  }
  return sections;
};

/** Bracket columns by round: winners (or the only bracket), losers, and the grand final. */
export const bracketColumns = (t: Tournament) => {
  const cols = (list: TMatch[]) => {
    const rounds = [...new Set(list.map((m) => m.round))].sort((a, b) => a - b);
    return rounds.map((r) => list.filter((m) => m.round === r).sort((a, b) => a.order - b.order));
  };
  return {
    winners: cols(t.matches.filter((m) => m.bracket === 'winners' || m.bracket === null)),
    losers: cols(t.matches.filter((m) => m.bracket === 'losers')),
    final: t.matches.filter((m) => m.bracket === 'final'),
  };
};
