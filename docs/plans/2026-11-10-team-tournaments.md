# Teams & tournaments: implementation plan

**Status (2026-11-10):** Tasks 1–13 built, uncommitted in GT_2. Backend: every test file passes (run in batches from a local copy; the OneDrive mount is too slow for one run), including `utils/tournament/*` (85), `tournamentNotify` (6) and `controllers/tournament.handlers.test.mjs` (24). Mobile: `tsc --noEmit` clean; `utils/__tests__/tournament.test.ts` (11) and `notificationRouting.test.ts` (9, 2 new) pass in a minimal jest setup — run `npm test` in `mobile/` on your machine for the full suite. Device checklist (Task 14) not run.
Changes from the plan while building: editing is `PUT /api/tournaments/:id` (not `/:id/teams`); win/loss isn't offered for single elimination with 4 per match; moving a player between teams in the preview is tap-to-move (pick the team) instead of drag; cleanup helpers live in `utils/tournament/cleanup.js`; `GET /api/tournaments/:id` added for the results screen. Added 2026-11-11: schedule preview (round robin) and bracket preview on the setup screen; the preview sends an `rngSeed` that Start reuses (`seededRng`, separate `orderRng` for match order), so Start creates exactly the previewed matches; hand edits re-draw the preview. Screen restyled with section colors, sliding segmented controls, a 2×2 Format grid and fade/glide transitions; feature renamed on screen to "Teams & Tourneys". The old `components/MeetupTeams.tsx` was moved to `GT_2/_to_delete/` (this session can't delete files) — delete that folder.

**Goal:** Owners/moderators turn a meetup's players into singles or teams with a round robin or bracket; players report results; standings, brackets and group Stats update.
**Architecture:** A new `Tournament` collection (one per meetup) and `group.rankingLists`. Every rule — players, teams, schedules, brackets, results, standings, stats — is a pure function in `backend/src/utils/tournament/`, tested without a database. A new controller/router (`/api/tournaments`) loads docs, calls the rules, saves with the version-retry loop, and sends pushes. The app mirrors read-side helpers in `mobile/utils/tournament.ts` and adds setup, results, rankings and a Stats section.
**Tech stack:** Express + Mongoose, `node --test --experimental-test-module-mocks`; Expo/React Native, TypeScript, jest (`jest-expo`).
**Spec:** `docs/specs/2026-11-10-team-tournaments-design.md`

**Global constraints**
- Entrants 2–32. Round robin ≤ 16 entrants. `teamsPerMatch` ∈ {2,3,4} and ≤ entrants. Double elimination only with `teamsPerMatch = 2`. `resultType: 'places'` only with `teamsPerMatch` 3–4. `format: 'none'` only with `mode: 'teams'`.
- Team names ≤ 24 chars (default `Team N`). Ranking list names 1–30 chars; ≤ 10 lists per group.
- Player key: user id string, or `guest:<hostClerkId>:<n>` (n from 1, from `meetup.guests[].count`). Guests label "<First>'s guest", "<First>'s guest 2".
- `playersKey` = sorted player keys joined with `,`. Players = `meetup.in` + their guests + `extraPlayers` (ticked Undecided) not in `meetup.out`.
- Bracket 3–4 per match: top half advance (2→1, 3→1, 4→2). No grand-final reset.
- Points: highest wins; equal = tie (round robin only). Round robin standings: 2-team win 1 / tie ½; k-team match scores k − place; tiebreak head-to-head → point difference (points mode) → seed.
- Push types `tournament-set`, `tournament-match-ready`, `tournament-finished` → mute kind `changes`.
- Create/Update/Randomize/edit teams/rankings: `canManageGroup` (from `group.controller.js`) + `groupHasPremium`. View/report: any group member.
- Random choices take an injected `rng` (default `Math.random`) so tests are deterministic.
- The working tree holds other uncommitted work in `meetup.controller.js`, `meetup.route.js`, `meetup.model.js`, `group.model.js`, `mobile/utils/api.ts`, `MeetupDetailModal.tsx`, `group-settings/[id].tsx`, `group-stats/[id].tsx`. Edit only the lines named here; don't reformat (CRLF files).

**Review focus**
1. Update with identical players → no write, `{ unchanged: true }`; with a change and results present but no `confirm: true` → 409 `results_exist` (Task 7 tests).
2. Correcting a bracket result after the winner played on → non-manager 403; manager clears every downstream match, including the losers-bracket path in double elimination (Task 4 tests).
3. A bye never needs a result and its team advances immediately; no `tournament-match-ready` push for a bye-only match (Tasks 3, 8).
4. A guest's host goes Out → Update drops the host and their guests (Task 1 test).
5. Two players report the same match at once → one wins via VersionError retry, the other's write is re-applied on the fresh doc, never lost silently (Task 7 test with a stubbed VersionError).

## File map
| File | Change |
|---|---|
| `backend/src/utils/tournament/players.js` (+ test) | new: players, keys, ranking, teams, seeds |
| `backend/src/utils/tournament/roundRobin.js` (+ test) | new: 2-team and k-team schedules, finale order, rounds |
| `backend/src/utils/tournament/bracket.js` (+ test) | new: single/double elimination, byes, advancement |
| `backend/src/utils/tournament/results.js` (+ test) | new: validate/apply results, clear downstream, standings, finish |
| `backend/src/utils/tournament/stats.js` (+ test) | new: person/team/event stats |
| `backend/src/utils/tournament/build.js` (+ test) | new: config validation + whole-event generation |
| `backend/src/models/tournament.model.js` | new |
| `backend/src/models/group.model.js` | `rankingLists` |
| `backend/src/models/notification.model.js` | 3 enum values, `tournament` ref |
| `backend/src/utils/groupMute.js` | 3 types → `changes` |
| `backend/src/controllers/tournament.controller.js` (+ `tournament.handlers.test.mjs`) | new |
| `backend/src/routes/tournament.route.js`, `server.js` | new router at `/api/tournaments` |
| `backend/src/utils/tournamentNotify.js` (+ test) | new |
| `meetup.controller.js`, `meetup.route.js`, `meetup.model.js`, `memberCleanup.js` | remove team splits; delete unfinished events with their meetup |
| `group.controller.js`, `user.controller.js`, `meetupGeneration.js` | cleanup on group/account/meetup deletion |
| `mobile/utils/tournamentApi.ts` | new: types + calls |
| `mobile/utils/tournament.ts` (+ `__tests__/tournament.test.ts`) | new: setup rules, labels, my team/next match, canReport, rounds/bracket columns |
| `mobile/app/tournament-setup/[meetupId].tsx` + `_layout.tsx` | new |
| `mobile/app/tournament/[id].tsx` + `_layout.tsx`, `components/tournament/*` | new: results screen, result sheet, bracket view |
| `mobile/app/group-rankings/[id].tsx` + `_layout.tsx` | new |
| `mobile/components/MeetupTournamentCard.tsx` | new; replaces `MeetupTeams.tsx` (deleted) |
| `MeetupDetailModal.tsx`, `group-settings/[id].tsx`, `group-stats/[id].tsx`, `notificationRouting.ts` (+ test), `notifications.tsx`, `notificationIcons.ts`, `api.ts` | wire-up |

---

## Task 1: Players, ranking, teams
**Files:** create `backend/src/utils/tournament/players.js`, `players.test.mjs`.
**Produces:**
- `collectPlayers(meetup, { extraPlayers = [], clerkIdOf }) → Player[]` where `Player = { key, user: string|null, guestOf: string|null, guestIndex: number|null }`
- `playersKey(players) → string`
- `rankPlayers(players, order: string[], rng) → Player[]` (listed users in list order; everyone else after, shuffled; a guest follows nobody in particular)
- `formTeams(rankedPlayers, { teamSize?, teamCount?, balance, rng }) → Player[][]`
- `teamSeeds(teams, rankedPlayers) → number[]` (average rank, ascending = stronger; ties by lowest single rank)
- [ ] Failing tests: In A,B + B has 2 guests + extra C → keys `[A, B, guest:cB:1, guest:cB:2, C]`; C also in `out` → C dropped; B moves to `out` → B and both guests dropped; `playersKey` order-independent; `rankPlayers` with order [C,A] and fixed rng puts C,A first; 13 players `teamSize: 2` → 6 teams, sizes {2×5, 3×1}; `teamCount: 4` on 10 → sizes {3,3,2,2}; balance with 8 ranked into 2 teams → team 1 = ranks 1,4,5,8, team 2 = 2,3,6,7 (snake); neither size nor count → throws `team_size_required`.
- [ ] Run `npm test` in `backend/` → FAIL (module not found). Implement. → PASS. Commit.

## Task 2: Round robin
**Files:** create `backend/src/utils/tournament/roundRobin.js`, `roundRobin.test.mjs`.
**Produces:** `roundRobin(teamIds: string[], { perMatch, seedOf?: (id)=>number, finale = false, rng }) → { round: number, order: number, teams: string[] }[]`.
- [ ] Failing tests: 4 teams, perMatch 2 → 6 matches, 3 rounds, each pair once, nobody twice in a round; 5 teams → 10 matches, 5 rounds (one bye each); perMatch 3 with 6 teams → every pair meets ≥ 1, per-team match counts differ ≤ 1, nobody twice in a round; perMatch 4 with 9 teams → same invariants; `finale: true` with seeds 1..6 → last match is {1,2}, first match has the largest seed gap; without finale and with a fixed rng → deterministic order; 2 teams perMatch 2 → 1 match.
- [ ] FAIL → implement (circle method for 2; greedy covering for 3–4, choosing the candidate group that covers the most unmet pairs, then fewest matches played) → PASS. Commit.

## Task 3: Brackets
**Files:** create `backend/src/utils/tournament/bracket.js`, `bracket.test.mjs`.
**Produces:**
- `singleElimination(seededTeamIds, { perMatch }) → Match[]`, `doubleElimination(seededTeamIds) → Match[]`
- `Match = { id, round, bracket: 'winners'|'losers'|'final'|null, order, slots: [{ team: string|null, from: { match, place?, loser? }|null }], results: [], status: 'waiting'|'ready'|'done'|'bye' }`
- `resolveSlots(matches) → { matches, newlyReady: string[] }`: fills slots from finished feeders; marks byes done and advances their teams; `ready` once every slot that will ever be filled is filled.
- [ ] Failing tests: 8 seeds single → round 1 pairs 1v8, 4v5, 2v7, 3v6 in that order; 6 seeds → 2 byes to seeds 1 and 2 who appear in round 2 after `resolveSlots`; seeds 1 and 2 can only meet in the final; perMatch 4 with 16 → 4 first-round matches, each holds exactly one of seeds 1–4, final has 4 slots fed by places 1–2; perMatch 3 with 9 → 3 matches → final of 3; double with 4 → winners 3 matches, losers 2, final 1; simulating every match with higher seed winning → each eliminated team has exactly 2 losses except possibly the final's loser; double with 5 → byes handled in both brackets.
- [ ] FAIL → implement → PASS. Commit.

## Task 4: Results and standings
**Files:** create `backend/src/utils/tournament/results.js`, `results.test.mjs`.
**Produces:**
- `normalizeResult(match, resultType, body, { allowTie }) → results[]` throws `invalid_result` / `tie_not_allowed`. Body: points `{ scores: { [teamId]: number } }` (integers 0–999), winLoss `{ winner: teamId|null }` (null = tie), places `{ order: teamId[] }`.
- `placesOf(match) → { [teamId]: place }` (ties share a place).
- `applyResult(t, matchId, body, { isManager }) → { cleared: string[], newlyReady: string[], finished: boolean, championChanged: boolean }`; throws `locked` when a downstream match is done and `!isManager`; throws `not_ready` for a waiting match.
- `standings(t) → [{ team, played, wins, losses, ties, points, pointDiff }]` sorted per Global constraints.
- `championOf(t) → teamId|null` (round robin: top of standings once all done; bracket: final winner).
- [ ] Failing tests: points 11–7 → winner; 7–7 in round robin → tie, in a bracket → `tie_not_allowed`; places on a 4-team match must list every team once; round robin of 3 where A>B, B>C, C>A all 1–0 points mode equal → falls to point diff then seed; head-to-head tiebreak case; bracket: correcting round-1 result after round-2 done → non-manager `locked`, manager clears round 2 (and its losers-bracket destination in double); last result sets `finished` and champion; correcting it reopens (`finished` false).
- [ ] FAIL → implement → PASS. Commit.

## Task 5: Build an event from a config
**Files:** create `backend/src/utils/tournament/build.js`, `build.test.mjs`.
**Consumes:** Tasks 1–4. **Produces:**
- `validateConfig(config, { entrantCount }) → config` (throws `{ code, message }` per Global constraints).
- `buildEvent({ players, config, rankingOrder, rng }) → { teams: [{ _id, name, seed, players }], matches, playersKey }`. `config = { mode, teamSize?, teamCount?, format, teamsPerMatch, resultType, balanceTeams, buildToFinale, randomize?, teams?: [{ name, players: key[] }], seedOrder?: number[] }`. Hand-set `teams` and `seedOrder` override generation; every player must appear exactly once.
- [ ] Failing tests: singles 12 round robin → 12 teams of 1, 66 matches; teams size 2 of 12, single elimination → 6 teams, 2 byes; double + perMatch 3 → `double_needs_pairs`; round robin with 17 entrants → `too_many_for_round_robin`; `format: 'none'` → teams, no matches; `places` with perMatch 2 → `places_needs_multi`; hand teams missing a player → `players_mismatch`; weighting off + `randomize` with two rngs → different orders.
- [ ] FAIL → implement → PASS. Commit.

## Task 6: Models and cleanup
**Files:** create `backend/src/models/tournament.model.js`; modify `group.model.js` (add `rankingLists: [{ name, order: [ObjectId ref User], updatedAt }]`), `notification.model.js` (enum `tournament-set`, `tournament-match-ready`, `tournament-finished`; field `tournament` ref), `groupMute.js` (`KIND_FOR_TYPE` three → `changes`), `group.controller.js` (group delete → `Tournament.deleteMany({ group })`; line ~788 schedule removal → delete unfinished for those meetups), `meetup.controller.js` `deleteMeetup` and `meetupGeneration.js` stale delete → `Tournament.deleteMany({ meetup: { $in }, status: 'active' })`, `user.controller.js` (owned-group delete path → delete tournaments; account deletion → `$pull` user from every `rankingLists.order`), `memberCleanup.js` (leaving/removed → `$pull` from that group's lists).
**Produces:** `Tournament` model per spec "Storage" with `extraPlayers: [ObjectId]`, unique index `{ meetup: 1 }`, index `{ group: 1, status: 1, meetupStartsAt: -1 }`.
- [ ] Failing tests: `groupMute.test.mjs` `kindOf('tournament-finished') === 'changes'`; extend `group.controller.test.mjs` delete-group test to assert `Tournament.deleteMany` called with `{ group }`; account-deletion test asserts the ranking-list pull.
- [ ] FAIL → implement → PASS. Commit.

## Task 7: API
**Files:** create `backend/src/controllers/tournament.controller.js`, `backend/src/routes/tournament.route.js`, `backend/src/controllers/tournament.handlers.test.mjs`; modify `server.js` (`app.use("/api/tournaments", tournamentRoutes)`); remove `setTeams` + route + `teams` from `meetup.controller.js`/`meetup.route.js`/`meetup.model.js` and the `teams` lines in `memberCleanup.js` and `meetup.controller.js` (lines ~224, ~253).
**Routes (all `protectRoute`):**
- `GET /by-meetup/:meetupId` → `{ tournament|null }` (members)
- `POST /` `{ meetupId, config, extraPlayers, preview? }` → preview returns the unsaved event; otherwise 201 `{ tournament }`; 409 `exists` if one exists
- `POST /:id/update` `{ confirm? }` → `{ unchanged: true }` | 409 `results_exist` | `{ tournament }`
- `POST /:id/randomize` → 400 `weighted` when `buildToFinale || balanceTeams`; same results rule as update
- `PUT /:id/teams` `{ teams, seedOrder? }` (names/players by hand; same results rule)
- `PUT /:id/matches/:matchId/result` `{ ...body }` (Task 4 body) → `{ tournament }`; 403 `not_in_match` / `locked`
- `DELETE /:id` (managers)
- `GET /rankings/:groupId`, `POST /rankings/:groupId` `{ name, order }`, `PUT /rankings/:groupId/:listId`, `DELETE /rankings/:groupId/:listId` (managers + Premium; 400 `too_many_lists` at 10)
- `GET /stats/:groupId` (members + Premium) → Task 9 shape
- Responses populate player names (`firstName lastName profilePicture clerkId`) and guest hosts.
- [ ] Failing tests (models stubbed like `rides.handlers.test.mjs`): non-manager create → 403; non-Premium create → 403 `premium_required`; create, and an Update that changes players, → push `tournament-set` to every user player; Premium off → reporting a result still 200, update 403; update unchanged → no save; update with results and no confirm → 409; member not in match reports → 403; player reports → 200 and standings change; VersionError on first save then success → result present; 11th list → 400; meetup cancelled → create 400 `closed`; old `PUT /api/meetups/:id/teams` gone (404 from router).
- [ ] FAIL → implement (version-retry loop as in `setTeams`, max 3) → PASS; full `npm test` → PASS. Commit.

## Task 8: Pushes
**Files:** create `backend/src/utils/tournamentNotify.js`, `tournamentNotify.test.mjs`; called from Task 7 handlers.
**Produces:** `notifyTournament(kind, { tournament, meetup, group, actorId, newlyReady })` using `notifyAndPersist` with `data: { meetupId, tournamentId, groupId, pushType }`.
- `tournament-set`: "<Group>: teams are set" / "You're on <Team>" (singles: "Your first match is vs <name>"); to all user players except the actor.
- `tournament-match-ready`: "<Your team> vs <others> is up" to players of `newlyReady` matches only (never byes).
- `tournament-finished`: "<Champion> won <Group>'s event" to all players.
- [ ] Failing tests for wording, recipients, actor excluded, no push for byes. FAIL → implement → PASS. Commit.

## Task 9: Stats
**Files:** create `backend/src/utils/tournament/stats.js`, `stats.test.mjs`.
**Produces:** `buildTournamentStats(finishedTournaments) → { titles: [{ user, titles }], people: [{ user, events, wins, losses, ties, winPct, titles }], teams: [{ users: string[], events, wins, losses, ties, winPct, titles }], events: [{ tournamentId, meetupId, date, format, mode, champion: { name, users } }] }`.
- [ ] Failing tests: guests never appear; a 4-team match counts 1st as win, others as losses; team record only for identical user sets with ≥ 2 events; a team containing a guest has no team record but its users get individual results; events newest first; unfinished events excluded.
- [ ] FAIL → implement → PASS. Commit.

## Task 10: App data layer
**Files:** create `mobile/utils/tournamentApi.ts`, `mobile/utils/tournament.ts`, `mobile/utils/__tests__/tournament.test.ts`; modify `mobile/utils/api.ts` (remove `teams` and `setTeams` only).
**Produces:** types `Tournament`, `TMatch`, `TTeam`, `TournamentConfig`, `RankingList`, `TournamentStats`; `tournamentApi.{ getForMeetup, preview, create, update, randomize, setTeams, report, remove, listRankings, saveRanking, updateRanking, deleteRanking, getStats }(api, …)`; helpers `allowedFormats(mode, perMatch)`, `allowedResultTypes(perMatch)`, `playerLabel(player, meetup)`, `myTeam(t, userId)`, `myNextMatch(t, userId)`, `canReport(t, match, userId, canManage)`, `roundsOf(t)`, `bracketColumns(t)`, `resultLine(match, t)`.
- [ ] Failing jest tests: double hidden for perMatch 3; places hidden for 2; `canReport` true for a player in the match, false for a guest-host not in it, true for a manager; `myNextMatch` skips done and byes; `bracketColumns` groups winners/losers/final by round; guest label "Ana's guest 2".
- [ ] Run `npx jest utils/__tests__/tournament.test.ts` in `mobile/` → FAIL → implement → PASS; `npx tsc --noEmit` clean. Commit.

## Task 11: Setup screen
**Files:** create `mobile/app/tournament-setup/[meetupId].tsx`, `_layout.tsx`, `mobile/components/tournament/RankingEditor.tsx` (wraps `DraggableList`).
- [ ] Sections: Mode (Singles/Teams) → team size or number of teams; Format (Round robin / Single elim / Double elim / Just teams, filtered by `allowedFormats`); Teams per match; Results as (filtered); Players (In + guests ticked, Undecided unticked under "Also add"); Weighting (Off / saved list picker / "Make a new ranking", toggles Balance teams + Build to a finale; Save as… ≤ 30 chars); Preview (calls `preview`, shows teams with drag between teams + rename, and team seed order drag) → Start.
- [ ] Back confirms when changed (existing back-interceptor pattern). Errors from the API shown as toasts.
- [ ] `tsc` clean. Commit.

## Task 12: Results screen
**Files:** create `mobile/app/tournament/[id].tsx`, `_layout.tsx`, `components/tournament/ResultSheet.tsx`, `BracketView.tsx`, `StandingsTable.tsx`.
- [ ] Tabs: Matches (by round; your matches highlighted; tap → `ResultSheet` when `canReport`), Standings (round robin) or Bracket (horizontal scroll columns, byes greyed), Teams. Champion banner when finished.
- [ ] Managers' menu: Update (handles `unchanged` toast "No changes — everyone's still the same", `results_exist` confirm "This clears the recorded results"), Randomize (only when weighting off), Edit teams (→ setup in edit mode), Delete.
- [ ] `ResultSheet`: points steppers / winner picker (+ Tie in round robin) / drag places; `locked` → message "Only an owner or moderator can change this now".
- [ ] Refetch on focus, pull-to-refresh, every 15 s while focused. `tsc` clean. Commit.

## Task 13: Meetup card, rankings, notifications, stats
**Files:** create `mobile/components/MeetupTournamentCard.tsx`, `mobile/app/group-rankings/[id].tsx`, `_layout.tsx`; delete `mobile/components/MeetupTeams.tsx`; modify `MeetupDetailModal.tsx` (swap the card), `group-settings/[id].tsx` (Rankings row under Premium links), `group-stats/[id].tsx` (Tournaments section: titles leaderboard, people, teams, past events → `/tournament/[id]`), `notificationRouting.ts` (+ test: new kind `tournament` → `/tournament/[id]`), `notifications.tsx` + `notificationIcons.ts` (3 types).
- [ ] Card: managers without an event → "Set up teams & matches" (Premium-gated like today); with an event → your team, your next match, **See Results**.
- [ ] Rankings screen: list (≤ 10), add/rename/delete, edit order with `RankingEditor`.
- [ ] Failing routing test first → implement → PASS; `tsc` clean; full `npx jest` in `mobile/`. Commit.

## Task 14: Verify
- [ ] Backend `npm test` all pass; mobile `tsc` + jest pass.
- [ ] Reread spec line by line against the build; fresh reviewer pass over the diff.
- [ ] Device checklist (owner + member accounts, iOS and Android, light/dark): 12-player doubles round robin with Build to a finale; singles single-elim with 6 (byes); 4-per-match Smash bracket; double elim of 5; member reports a result, standings move; correct a played-on bracket result as member (blocked) and owner (downstream cleared); RSVP Out then Update; Update with no changes; Randomize; save 10 lists then an 11th; Stats section after two finished events; pushes for set/ready/finished respect "meetup changes" mute.
- [ ] Ship order: backend before the app build.
