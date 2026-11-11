// Teams & tournaments API (Premium). Server: backend/src/routes/tournament.route.js.
import { AxiosInstance } from 'axios';

export type TMode = 'singles' | 'teams';
export type TFormat = 'none' | 'roundRobin' | 'single' | 'double';
export type TResultType = 'points' | 'winLoss' | 'places';

export interface TPlayer { key: string; user: string | null; guestOf: string | null; guestIndex: number | null }
export interface TTeam { key: string; name: string | null; seed: number; players: TPlayer[] }
export interface TSlot { team: string | null; from: { match: string; place?: number; loser?: boolean } | null }
export interface TResult { team: string; place: number; points?: number }
export interface TMatch {
  id: string;
  round: number;
  order: number;
  bracket: 'winners' | 'losers' | 'final' | null;
  advance: number | null;
  slots: TSlot[];
  results: TResult[];
  status: 'waiting' | 'ready' | 'done' | 'bye';
  reportedBy?: string | null;
  reportedAt?: string | null;
}
export interface TStandingRow { team: string; played: number; wins: number; losses: number; ties: number; score: number; pointsFor: number; pointDiff: number }

export interface Tournament {
  _id: string | null;
  group: string;
  meetup: string;
  meetupStartsAt: string | null;
  status: 'active' | 'finished';
  mode: TMode;
  format: TFormat;
  teamsPerMatch: 2 | 3 | 4;
  resultType: TResultType;
  teamSize: number | null;
  teamCount: number | null;
  weighting: { listId: string | null; order: string[]; balanceTeams: boolean; buildToFinale: boolean };
  extraPlayers: string[];
  playersKey: string;
  teams: TTeam[];
  matches: TMatch[];
  champion: string | null;
  people: Record<string, { firstName?: string; lastName?: string; profilePicture?: string; clerkId?: string }>;
  hosts: Record<string, { firstName?: string; lastName?: string }>;
  standings: TStandingRow[] | null;
  canManage: boolean;
}

export interface TournamentConfig {
  mode: TMode;
  teamSize?: number;
  teamCount?: number;
  format: TFormat;
  teamsPerMatch: 2 | 3 | 4;
  resultType: TResultType;
  balanceTeams: boolean;
  buildToFinale: boolean;
}

export interface SetupBody {
  config: TournamentConfig;
  extraPlayers: string[];
  ranking?: string[];
  rankingListId?: string | null;
  teams?: { name: string | null; players: string[] }[];
  seedOrder?: number[];
  /** Same seed as the preview, so Start creates exactly the previewed matches. */
  rngSeed?: number;
  confirm?: boolean;
}

export type ResultBody = { scores: Record<string, number> } | { winner: string | null } | { order: string[] };

export interface RankingList { _id: string; name: string; order: string[]; updatedAt?: string }

export interface TournamentStats {
  titles: { user: string; titles: number }[];
  people: { user: string; events: number; wins: number; losses: number; ties: number; winPct: number; titles: number }[];
  teams: { users: string[]; events: number; wins: number; losses: number; ties: number; winPct: number; titles: number }[];
  events: { tournamentId: string; meetupId: string; date: string; format: TFormat; mode: TMode; champion: { team: string; name: string | null; users: string[] } | null }[];
  names: Record<string, { firstName?: string; lastName?: string; profilePicture?: string }>;
}

type One = { tournament: Tournament };

export const tournamentApi = {
  getForMeetup: async (api: AxiosInstance, meetupId: string) =>
    (await api.get<{ tournament: Tournament | null }>(`/api/tournaments/by-meetup/${meetupId}`)).data.tournament,
  get: async (api: AxiosInstance, id: string) => (await api.get<One>(`/api/tournaments/${id}`)).data.tournament,
  preview: async (api: AxiosInstance, meetupId: string, body: SetupBody) =>
    (await api.post<One>('/api/tournaments', { meetupId, ...body, preview: true })).data.tournament,
  create: async (api: AxiosInstance, meetupId: string, body: SetupBody) =>
    (await api.post<One>('/api/tournaments', { meetupId, ...body })).data.tournament,
  edit: async (api: AxiosInstance, id: string, body: SetupBody) => (await api.put<One>(`/api/tournaments/${id}`, body)).data.tournament,
  /** `unchanged: true` when nobody joined or left. */
  update: async (api: AxiosInstance, id: string, confirm = false) =>
    (await api.post<{ tournament: Tournament; unchanged?: boolean }>(`/api/tournaments/${id}/update`, { confirm })).data,
  randomize: async (api: AxiosInstance, id: string, confirm = false) =>
    (await api.post<One>(`/api/tournaments/${id}/randomize`, { confirm })).data.tournament,
  report: async (api: AxiosInstance, id: string, matchId: string, body: ResultBody) =>
    (await api.put<One>(`/api/tournaments/${id}/matches/${matchId}/result`, body)).data.tournament,
  remove: async (api: AxiosInstance, id: string) => { await api.delete(`/api/tournaments/${id}`); },
  listRankings: async (api: AxiosInstance, groupId: string) =>
    (await api.get<{ lists: RankingList[] }>(`/api/tournaments/rankings/${groupId}`)).data.lists,
  saveRanking: async (api: AxiosInstance, groupId: string, name: string, order: string[]) =>
    (await api.post<{ lists: RankingList[]; list: RankingList }>(`/api/tournaments/rankings/${groupId}`, { name, order })).data,
  updateRanking: async (api: AxiosInstance, groupId: string, listId: string, body: { name?: string; order?: string[] }) =>
    (await api.put<{ lists: RankingList[] }>(`/api/tournaments/rankings/${groupId}/${listId}`, body)).data.lists,
  deleteRanking: async (api: AxiosInstance, groupId: string, listId: string) =>
    (await api.delete<{ lists: RankingList[] }>(`/api/tournaments/rankings/${groupId}/${listId}`)).data.lists,
  getStats: async (api: AxiosInstance, groupId: string) => (await api.get<TournamentStats>(`/api/tournaments/stats/${groupId}`)).data,
};

/** The server's error code (e.g. 'results_exist') and readable message, if any. */
export const apiError = (err: any): { code: string | null; message: string } => ({
  code: err?.response?.data?.error ?? null,
  message: err?.response?.data?.message || err?.message || 'Something went wrong.',
});
