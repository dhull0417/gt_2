# Teams & tournaments (2026-11-10)

## Intent
Team splits today (Premium, staging only) shuffle the people who are In into 2–8 named teams.
Groups that play things — pickleball doubles, a Smash Bros night, a singles ladder — also need
**matches**: who plays whom, in what order, who won, and who's champion. Organizers also want to
**weight** it: even teams, or easy mismatches first building to "a clash of the titans" at the end.
Results should last beyond the meetup and show up in group **Stats**.

## Goals
- On a meetup, an owner or moderator sets up an **event**:
  - **Mode:** **Singles** (every player is their own entrant; no team step) or **Teams** (set
    team size *or* number of teams).
  - **Format:** **Round robin**, **Bracket — single elimination**, **Bracket — double
    elimination**, or **Just teams** (no matches; today's team split). *(Just teams: my call, so
    the existing feature isn't lost.)*
  - **Teams per match:** 2, 3 or 4.
  - **Results recorded as:** **Points** (e.g. 11–7), **Win/loss**, or **Finishing places**.
- **Weighting** with a ranking list: numbered spots, drag members (or teams) up and down, same
  feel as the Priority RSVP list (`components/DraggableList.tsx`). Owners/moderators can **name,
  save and reuse up to 10 lists per group**. A ranking can:
  - **Balance teams** (snake draft: picks 1→N, then N→1).
  - **Build to a finale** (round robin: biggest mismatches first, top teams meet last; brackets:
    standard seeding, #1 vs lowest seed, top seeds meet in the final).
- **Randomize** (shown only when weighting is off) reshuffles teams and match order / bracket
  positions.
- **Update** regenerates everything from scratch from the current players, leaving out anyone
  marked Out. If the players haven't changed it changes nothing and says "No changes — everyone's
  still the same."
- **Results:** a player on any team in a match can enter that match's result; owners and
  moderators can enter or fix any result. Standings update; bracket winners advance automatically.
- **See Results** button on the meetup for everyone.
- **Stats** section: per-person totals, per-team totals, past events.
- Premium, like team splits today.

## Non-goals
- Courts/stations and match times (left off for now).
- Swiss, pools-then-bracket, ladders, ELO-style automatic ratings.
- Results from guests counting in Stats.
- Several events on one meetup.

## Anti-goals
- Never let a score write collide with RSVP saves (why events don't live on the meetup).
- Never lose results when the meetup is cleaned up.

## Approach (chosen: B)
A new **`Tournament` collection**, one per meetup (unique index on `meetup`), pointing at the
meetup and group. All generation (teams, round robin, brackets, seeding, advancement, standings)
lives in **pure functions** under `backend/src/utils/tournament/`, unit tested without a database.
The meetup gets nothing new; the app asks `GET /api/meetups/:id/tournament`.

Considered: (A) store on the meetup like `meetup.teams` — heavier meetup loads everywhere, more
version conflicts with RSVPs during live scoring, and needs a copy step before cleanup.
(C) generate on the phone, server stores — untestable, anyone can post a fake bracket.

**Replaces** `meetup.teams`, `PUT /api/meetups/:id/teams` and `components/MeetupTeams.tsx`
(team splits never shipped to a store build; staging and production share one database, so the
leftover `teams` field on existing meetups is simply ignored).

## Decisions

### Who plays
- Setup starts from everyone **In**, plus each member's **guests** (one line per guest: "Ana's
  guest", "Ana's guest 2", same convention as rides).
- *(My call)* Undecided members are listed unticked under "Also add"; the organizer can tick them
  (people often show up without RSVPing). Out members are never offered.
- **Update** = rebuild from: In + guests + any Undecided the organizer ticked who haven't since
  gone Out. "Players changed" compares the sorted list of player keys (user id, or
  `guest:<hostClerkId>:<n>`); same list → no-op message. If anything changed and results exist,
  confirm "This clears the recorded results" first.
- *(My call)* Limits: 2–32 entrants; round robin up to 16 entrants (120 two-team matches).

### Teams
- Teams mode: organizer sets **team size** or **number of teams**. By number of teams, leftover
  players are spread so sizes differ by at most one. By team size, players who don't divide evenly
  each play on their own team: the top-ranked ones, or random ones without a ranking (owner's
  decision 2026-11-11; the setup screen says so); the organizer can move people between teams (tap a player, pick the team) and
  rename teams (≤24 chars, as today) before starting.
- With a ranking and **Balance teams**: snake draft by rank. Guests and anyone not on the list
  rank at the bottom in random order.
- Team seed (for ordering/brackets): Singles = the player's rank. Teams = average rank of the
  team's players *(my call)*; the organizer can also drag teams into seed order directly on the
  setup screen.

### Ranking lists (saved on the group)
- `group.rankingLists: [{ _id, name (≤30), order: [User], updatedAt }]`, at most **10**.
- Created/renamed/edited/deleted by owners and moderators, from setup ("Use a saved list / Save
  as…") and from Group Settings → **Rankings**. Members who leave the group drop off lists
  (`memberCleanup.js`).
- Lists are only visible to owners and moderators *(my call — a public "weakest" ranking stings)*.

### Formats
- **Round robin, 2 teams per match:** circle method; every pair meets once. Rounds where nobody
  plays twice; an odd count gives one bye per round.
- **Round robin, 3–4 teams per match:** every pair of teams meets at least once, match counts per
  team differ by at most one, no team twice in a round. Exact balance isn't always possible; the
  generator is greedy and its invariants are tested *(builder picks the algorithm)*.
- **Build to a finale (round robin):** matches ordered by seed gap, largest first; the last match
  is the top seeds against each other. Rounds are packed in that order.
- **Single elimination:** standard seeded bracket, padded with byes to the next full size; top
  seeds get the byes. In 3- or 4-team matches the **top half advance** (2→1, 3→1, 4→2) *(my call)*.
- **Double elimination:** winners and losers brackets plus a single grand final (no bracket
  reset) *(my call)*. **2 teams per match only** (owner's decision); setup hides double
  elimination when 3 or 4 teams per match is chosen.
- **Randomize:** random seeds/order instead of the ranking.

### Results
- **Points:** each team's score. Highest wins. Equal = tie (round robin only; brackets need a
  winner and reject a tie).
- **Win/loss:** pick the winner (round robin also allows "Tie").
  Not offered for single elimination with 4 per match (two teams advance, so second place
  must be known) — use points or places there (owner-approved 2026-11-10).
- **Places:** order the teams 1st…kth.
- Who: a player on any team in that match, or an owner/moderator. Latest entry stands.
- A bracket result whose winner has already played a later match can only be changed by an
  owner/moderator; the later matches it affects are cleared.
- Standings (round robin): 2-team matches win 1, tie ½; place-based matches score k−place.
  Ties broken by head-to-head, then point difference (points mode), then seed.
- The event is **finished** when the last match has a result → champion set. Correcting a
  result reopens it.

### Storage
`Tournament`: `group`, `meetup`, `meetupStartsAt`, `status` ('active' | 'finished'), `mode`,
`format`, `teamsPerMatch`, `resultType`, `weighting { listId, balanceTeams, buildToFinale }`,
`playersKey`, `teams [{ _id, name, seed, players [{ user | guestOf + guestIndex }] }]`,
`matches [{ _id, round, bracket ('winners'|'losers'|'final'|null), order, slots [{ team, from
{ match, place, loser } }], results [{ team, points, place }], status ('waiting'|'ready'|'done'|
'bye'), reportedBy, reportedAt }]`, `champion` (team id), `createdBy`, timestamps.
- Survives meetup cleanup. Deleted with its group, and when its meetup is deleted while the
  event is unfinished *(my call)*. Account deletion keeps past results; the name shows as
  "Former member".

### API note
Editing an existing event (settings, players, ranking or hand-set teams) is one call,
`PUT /api/tournaments/:id`, which regenerates with the same results-exist confirmation as Update
(owner-approved 2026-11-10).

### Permissions & Premium
- Create, Update, Randomize, edit teams, ranking lists: owners/moderators, group has Premium.
- Viewing and entering results: any group member; works even if Premium lapses mid-event.
- Stats section follows the existing Stats Premium rule.

### Notifications (mute kind `changes`)
- `tournament-set`: "Teams are set — you're on Team 2" on create and on Update that changes
  players (to everyone playing).
- `tournament-match-ready`: bracket match now has all its teams (to those players).
- `tournament-finished`: champion announced (to everyone playing).
- All route to the results screen (`utils/notificationRouting.ts`).

### App screens
- Meetup details: the Teams card becomes **Teams & matches**: "Set up" (managers), **See
  Results** (everyone, once an event exists), plus your team and next match.
- `app/tournament-setup/[meetupId].tsx`: mode, format, teams per match, result type, players,
  ranking (saved list picker + drag), Balance / Build to a finale toggles, preview, Start.
- `app/tournament/[id].tsx`: **Matches** (by round, tap to enter a result), **Standings** (round
  robin) or **Bracket**, **Teams**; managers get Update, Randomize, Edit. Refreshes on focus,
  pull-to-refresh, and every 15 s while open *(my call; realtime channels are flaky per the
  Android review)*.
- `app/group-rankings/[id].tsx`: the saved lists, from Group Settings.
- `app/group-stats/[id].tsx`: new **Tournaments** section.

### Stats
- **Titles leaderboard** at the top.
- **Per person:** events played, match wins, losses, ties, win %, titles. A "win" = 1st in that
  match (or the 2-team winner).
- **Per team:** the same, for an identical set of members (guests excluded) who've played at
  least 2 events together. Names show as the players' first names ("Dallin & Sam").
- **Past events:** date, format, champion; tap for the full standings/bracket.
- Built from finished `Tournament` docs; guests never counted.

## Left to the builder
Round-robin covering algorithm for 3–4 team matches; bracket drawing on screen; exact copy.

## Ship order
Backend before the app build (new routes). No legacy-app concerns: team splits never shipped.
