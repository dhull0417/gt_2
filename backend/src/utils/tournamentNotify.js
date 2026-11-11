// Pushes for teams & tournaments: teams set, your match is up, champion. All map to the
// "meetup changes" mute kind (utils/groupMute.js). The actor never gets their own push
// (notifyAndPersist drops the sender). Guests have no account, so they're never notified.
import User from "../models/user.model.js";
import { notifyAndPersist } from "./push.notifications.js";

const TYPE = { set: 'tournament-set', ready: 'tournament-match-ready', finished: 'tournament-finished' };

const playerLabel = (p, { names, hosts }) => {
  if (p.user) return names[String(p.user)] || 'Player';
  const host = hosts[p.guestOf] || 'Someone';
  return p.guestIndex > 1 ? `${host}'s guest ${p.guestIndex}` : `${host}'s guest`;
};
export const teamLabel = (team, ctx) => team.name || team.players.map((p) => playerLabel(p, ctx)).join(' & ') || 'Team';
const usersOf = (team) => team.players.filter((p) => p.user).map((p) => String(p.user));
const teamsIn = (m) => m.slots.map((s) => s.team).filter(Boolean);

/**
 * Pure: what to send. `ctx = { groupName, names: {userId: firstName}, hosts: {clerkId: firstName} }`.
 * @returns {{ to: string[], title: string, body: string }[]}
 */
export const tournamentPushes = (kind, { tournament: t, newlyReady = [], groupName, names = {}, hosts = {} }) => {
  const ctx = { names, hosts };
  const byKey = new Map(t.teams.map((tm) => [tm.key, tm]));
  const label = (key) => (byKey.get(key) ? teamLabel(byKey.get(key), ctx) : 'Team');
  if (kind === 'set') {
    const title = t.mode === 'singles' ? `${groupName}: the matches are set` : `${groupName}: teams are set`;
    return t.teams.map((team) => {
      const first = t.matches.find((m) => m.status === 'ready' && teamsIn(m).includes(team.key));
      const opponents = first ? teamsIn(first).filter((k) => k !== team.key).map(label).join(', ') : null;
      const parts = [];
      if (t.mode === 'teams') parts.push(`You're on ${label(team.key)}`);
      if (opponents) parts.push(`First up: ${opponents}`);
      return { to: usersOf(team), title, body: parts.join('. ') || "You're in" };
    }).filter((p) => p.to.length);
  }
  if (kind === 'ready') {
    return newlyReady.map((id) => t.matches.find((m) => m.id === id))
      .filter((m) => m && m.status === 'ready')
      .map((m) => ({
        to: teamsIn(m).flatMap((k) => (byKey.get(k) ? usersOf(byKey.get(k)) : [])),
        title: `${groupName}: you're up`,
        body: teamsIn(m).map(label).join(' vs '),
      }))
      .filter((p) => p.to.length);
  }
  if (kind === 'finished' && t.champion) {
    const to = t.teams.flatMap(usersOf);
    return to.length ? [{ to, title: `${groupName}: we have a champion`, body: `${label(t.champion)} won!` }] : [];
  }
  return [];
};

/** Look up first names for everyone in the event (players and guests' hosts). */
export const loadNames = async (t) => {
  const ids = [...new Set(t.teams.flatMap((tm) => tm.players.filter((p) => p.user).map((p) => String(p.user))))];
  const hostIds = [...new Set(t.teams.flatMap((tm) => tm.players.filter((p) => p.guestOf).map((p) => p.guestOf)))];
  const [users, hostUsers] = await Promise.all([
    ids.length ? User.find({ _id: { $in: ids } }).lean() : [],
    hostIds.length ? User.find({ clerkId: { $in: hostIds } }).lean() : [],
  ]);
  return {
    users,
    names: Object.fromEntries(users.map((u) => [String(u._id), u.firstName || 'Player'])),
    hosts: Object.fromEntries(hostUsers.map((u) => [u.clerkId, u.firstName || 'Someone'])),
  };
};

/** Send the pushes (best effort; errors are logged). */
export const notifyTournament = async (kind, { tournament, group, actorId, newlyReady = [] }) => {
  try {
    const t = typeof tournament.toObject === 'function' ? tournament.toObject() : tournament;
    const { users, names, hosts } = await loadNames(t);
    const byId = new Map(users.map((u) => [String(u._id), u]));
    for (const p of tournamentPushes(kind, { tournament: t, newlyReady, groupName: group.name, names, hosts })) {
      await notifyAndPersist(p.to.map((id) => byId.get(id)).filter(Boolean), {
        title: p.title,
        body: p.body,
        type: TYPE[kind],
        sender: actorId,
        group: group._id,
        meetup: t.meetup,
        data: { tournamentId: String(t._id), meetupId: String(t.meetup), groupId: String(group._id) },
        meta: { tournamentId: String(t._id) },
      });
    }
  } catch (err) {
    console.error(`Tournament push (${kind}) failed:`, err);
  }
};
