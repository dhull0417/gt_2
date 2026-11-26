// Shapes the full stats result for one viewer. Joke awards (and other members' Out /
// no-reply numbers, which would give them away) reach only owners and moderators unless
// an organizer turned on "Reveal to the group". Done on the server so the API never
// sends hidden data. Spec: docs/specs/2026-11-10-stats-awards-design.md

export const LEADERBOARD_SIZE = 5;
const HIDDEN_VALUE_AWARDS = new Set(['responder']);

export const shapeStatsForViewer = (full, { viewerId, isOrganizer, revealJokes }) => {
  const jokesVisible = Boolean(isOrganizer || revealJokes);
  const viewer = String(viewerId);
  const visibleAwards = full.awards.filter((a) => jokesVisible || !a.joke);

  // Always Answers = In + Out + waitlisted. Next to each member's "N of M", its number would
  // let anyone work out other people's Outs and no-replies, so it's rank-only while hidden.
  const hideValue = (a) => !jokesVisible && HIDDEN_VALUE_AWARDS.has(a.key);
  const awards = visibleAwards.map(({ ranking, ...a }) => {
    const people = hideValue(a) ? ranking.map((p) => ({ ...p, value: null })) : ranking;
    return {
      ...a,
      winners: people.filter((p) => p.rank === 1),
      leaderboard: people.slice(0, LEADERBOARD_SIZE),
    };
  });

  const me = {
    _id: viewer,
    categories: visibleAwards.map((a) => {
      const mine = a.ranking.find((p) => String(p._id) === viewer);
      return { key: a.key, value: mine ? mine.value : null, rank: mine ? mine.rank : null, of: a.ranking.length };
    }),
  };

  const members = full.members.map((m) => (jokesVisible || String(m._id) === viewer
    ? m
    : { ...m, declined: null, noResponse: null }));

  return {
    summary: full.summary,
    members,
    meetups: full.meetups,
    awards,
    me,
    viewer: { isOrganizer: Boolean(isOrganizer), jokesVisible, revealJokes: Boolean(revealJokes) },
  };
};
