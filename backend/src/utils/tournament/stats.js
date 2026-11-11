// Group Stats from finished tournaments: per person, per team (same exact members), titles and
// past events. Guests are never counted. Pure; no database.

const blank = () => ({ events: 0, wins: 0, losses: 0, ties: 0, titles: 0 });
const pct = (r) => {
  const played = r.wins + r.losses + r.ties;
  return played ? Math.round(((r.wins + r.ties / 2) / played) * 1000) / 1000 : 0;
};
const outcome = (m, teamKey) => {
  const mine = m.results.find((r) => String(r.team) === teamKey);
  if (!mine) return null;
  if (mine.place !== 1) return 'losses';
  return m.results.filter((r) => r.place === 1).length > 1 ? 'ties' : 'wins';
};

/**
 * @param {Array} tournaments plain Tournament docs (unfinished ones are skipped)
 * @returns {{ titles, people, teams, events }}
 */
export const buildTournamentStats = (tournaments) => {
  const finished = tournaments.filter((t) => t.status === 'finished' && t.champion);
  const people = new Map();
  const teams = new Map();
  const bump = (map, key, init) => {
    if (!map.has(key)) map.set(key, { ...init, ...blank() });
    return map.get(key);
  };
  for (const t of finished) {
    const champion = String(t.champion);
    for (const team of t.teams) {
      const key = String(team.key ?? team._id);
      const users = team.players.filter((p) => p.user).map((p) => String(p.user));
      const hasGuest = team.players.some((p) => !p.user);
      const rows = users.map((u) => bump(people, u, { user: u }));
      if (users.length >= 2 && !hasGuest) {
        const sorted = [...users].sort();
        rows.push(bump(teams, sorted.join(','), { users: sorted }));
      }
      for (const r of rows) {
        r.events++;
        if (key === champion) r.titles++;
      }
      for (const m of t.matches) {
        if (m.status !== 'done' || !m.results?.length) continue;
        const o = outcome(m, key);
        if (o) for (const r of rows) r[o]++;
      }
    }
  }
  const withPct = (r) => ({ ...r, winPct: pct(r) });
  const peopleList = [...people.values()].map(withPct).sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || a.user.localeCompare(b.user));
  return {
    titles: peopleList.filter((p) => p.titles > 0).map((p) => ({ user: p.user, titles: p.titles }))
      .sort((a, b) => b.titles - a.titles || a.user.localeCompare(b.user)),
    people: peopleList.map(({ user, events, wins, losses, ties, winPct, titles }) => ({ user, events, wins, losses, ties, winPct, titles })),
    teams: [...teams.values()].filter((t) => t.events >= 2).map(withPct)
      .map(({ users, events, wins, losses, ties, winPct, titles }) => ({ users, events, wins, losses, ties, winPct, titles }))
      .sort((a, b) => b.titles - a.titles || b.wins - a.wins),
    events: [...finished].sort((a, b) => new Date(b.meetupStartsAt) - new Date(a.meetupStartsAt)).map((t) => {
      const champ = t.teams.find((tm) => String(tm.key ?? tm._id) === String(t.champion));
      return {
        tournamentId: String(t._id),
        meetupId: String(t.meetup),
        date: t.meetupStartsAt,
        format: t.format,
        mode: t.mode,
        champion: champ ? { team: String(champ.key ?? champ._id), name: champ.name, users: champ.players.filter((p) => p.user).map((p) => String(p.user)) } : null,
      };
    }),
  };
};
