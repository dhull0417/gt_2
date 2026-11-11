# Stats awards — implementation plan

**Goal:** Add all-time awards (public + organizer-only joke awards), a "Your stats" card and RSVP timing capture to Stats & Attendance.

**Architecture:** A pure award engine (`backend/src/utils/statsAwards.js`) turns the finished-meetup events that `groupStats.js` already loads (now carrying an RSVP log and per-person guests/items/seats) plus chat and poll counts into ranked awards. A second pure function shapes that result for the viewer (hides joke awards and other people's Out / no-reply numbers from non-organizers unless revealed). The app renders it on the existing stats screen.

**Tech stack:** Node/Express + Mongoose, `node --test`; Supabase Postgres (one SQL function); Expo/React Native + TypeScript, jest.

**Spec:** `docs/specs/2026-11-10-stats-awards-design.md`

## Global constraints
- Award keys, titles, emoji exactly as the spec table: `reliable` Ol' Reliable 🫡, `streak` Iron Streak 🔥, `responder` Always Answers ✋, `quickDraw` Quick Draw ⚡, `plusOne` Plus-One Pro 👯, `chauffeur` Chauffeur 🚗, `snackCaptain` Snack Captain 🍕, `chatty` Chatty Cathy 💬, `voice` Voice of the People 🗳️, `decliner` Professional Decliner 🙅 (joke), `ghost` The Ghost 👻 (joke), `buzzer` Buzzer Beater ⏰ (joke), `weathervane` Weathervane 🌀 (joke). Order in the API = this order.
- Thresholds: meetup-based awards need ≥ 3 eligible meetups per person; timing awards need ≥ 3 logged meetups the person answered; `quickDraw` uses only events with `rsvpOpenDate`; `plusOne`/`chauffeur`/`snackCaptain` appear only when ≥ 3 events in the group carry per-person data; minimums `chatty` ≥ 10, `voice` ≥ 3, `weathervane` ≥ 2, `buzzer` ≥ 2; every award needs value > 0 (except `quickDraw`, where lower wins and 0 is valid).
- Buzzer window: first answer within 2 h before `rsvpCloseDate ?? startsAt`.
- Ranking: competition ranking (1, 1, 3); all rank-1 people are winners; leaderboard in the API = top 5 rows.
- `rsvpLog` cap: 200 entries per meetup, oldest dropped.
- Only current group members are ranked.
- Response format: the spec's `unit` field is dropped; the app formats values by award key (`mobile/utils/statsFormat.ts`). _My call; it keeps copy in one place._
- **No commits.** The working tree holds other uncommitted features in the same files (`meetup.controller.js`, `meetup.model.js`, `api.ts`, `group.controller.js`). Leave changes uncommitted and list them in `claude/todo.md` for the owner to review and commit.
- Backend tests: `npm test` in `backend/` (needs `--experimental-test-module-mocks`, already in the script). Mobile: `npx tsc --noEmit` and targeted `npx jest <file>` in `mobile/` (full jest is slow on the OneDrive mount).

## Review focus
1. Old archive records (no log, no per-person data) mixed with new ones must not count as zeros — e.g. nobody becomes The Ghost of timing data. → Task 2 test `old records without log are ignored by timing awards`.
2. Admin overrides, waitlist promotions and priority bumps must not appear in the log, so they can't create Weathervane changes. → Task 4 test `admin override is not logged`.
3. A non-organizer's raw JSON must contain no joke award and no other member's `declined`/`noResponse` numbers. → Task 7 test `member response hides joke data`.
4. Tiered members who answer before the general open must be timed from their tier, and no time may be negative. → Task 2 test `quickDraw uses tier opening and clamps at 0`.
5. Former members (left, removed, deleted) never appear in awards even if their history exists. → Task 7 test `former members are not ranked`.

## File map
| File | Change | Responsibility |
|---|---|---|
| `backend/src/utils/statsAwards.js` | new | Award catalog, per-member metrics, ranking, award assembly (pure) |
| `backend/src/utils/statsAwards.test.mjs` | new | Tests for the above |
| `backend/src/utils/rsvpLog.js` | new | `appendRsvpLog` (pure, capped) |
| `backend/src/utils/rsvpLog.test.mjs` | new | |
| `backend/src/utils/statsVisibility.js` | new | `shapeStatsForViewer` (pure) |
| `backend/src/utils/statsVisibility.test.mjs` | new | |
| `backend/src/utils/groupStats.js` | modify | `toRecord`/`loadEvents` carry new fields; `buildGroupStats` wires awards, chat, polls |
| `backend/src/utils/groupStats.test.mjs` | new | `toRecord` per-person fields |
| `backend/src/models/meetup.model.js` | modify | `rsvpLog` |
| `backend/src/models/attendanceRecord.model.js` | modify | new archived fields |
| `backend/src/models/group.model.js` | modify | `statsRevealJokes` |
| `backend/src/controllers/meetup.controller.js` | modify | append log in `rsvpMeetup` |
| `backend/src/controllers/group.controller.js` | modify | `getGroupStats` viewer shaping; new `updateStatsSettings` |
| `backend/src/routes/group.route.js` | modify | `PATCH /:groupId/stats-settings` |
| `backend/src/controllers/user.controller.js` | modify | account-deletion cleanup |
| `backend/src/controllers/stats.handlers.test.mjs` | new | handler tests (pattern: `rides.handlers.test.mjs`) |
| `backend/src/utils/supabaseAdmin.js` (+ `.test.mjs`) | modify | `chatMessageCounts` |
| `supabase/migrations/20261110000000_chat_message_counts.sql` | new | SQL function |
| `mobile/utils/api.ts` | modify | types + `updateStatsSettings` |
| `mobile/utils/statsFormat.ts` (+ `__tests__/statsFormat.test.ts`) | new | value/rank formatting, award blurbs |
| `mobile/components/stats/AwardCard.tsx`, `AwardSheet.tsx`, `YourStatsCard.tsx`, `HallOfShame.tsx` | new | UI pieces |
| `mobile/app/group-stats/[id].tsx` | modify | new layout |

---

## Task 1 — Ranking and meetup-based awards
**Files:** create `backend/src/utils/statsAwards.js`, `backend/src/utils/statsAwards.test.mjs`.
**Interfaces (produces):**
- `AWARDS: { key, title, emoji, joke: boolean, lowerIsBetter: boolean }[]` (order per Global constraints).
- `rankBy(entries: {id: string, value: number}[], { lowerIsBetter = false, min = null }) → {id, value, rank}[]` — drops `value <= 0` unless `lowerIsBetter`, drops values below `min` (higher-is-better awards only), sorts, competition ranks.
- `memberMetrics(events, memberIds: string[]) → Map<string, Metrics>` where `events` are `loadEvents` items (newest first) and `Metrics = { eligible, attended, declined, noResponse, bestStreak, currentStreak, timedAnswered, quickDrawMin: number|null, buzzer, changes, guests, items, seats }` (timing/per-person fields 0/null in this task).
- `computeAwards(metrics, { chat: Map<string,number>|null, polls: Map<string,number>, eventsWith: { log: number, perPerson: number } }) → { key, ...AWARDS[i], ranking: {id,value,rank}[] }[]` — awards with an empty ranking are omitted.

- [ ] Write tests: `rankBy ties share rank` ([5,5,3] → ranks 1,1,3); `rankBy drops zero and below min`; `reliable winner is most attended, needs 3 eligible` (member with 2 eligible/2 attended excluded); `bestStreak finds longest run in chronological order` (In,In,Out,In,In,In → 3; currentStreak 3); `decliner and ghost count out and no reply`; `responder = attended + declined`.
- [ ] Run `npm test` → FAIL: `Cannot find module './statsAwards.js'`.
- [ ] Implement the four exports for `reliable` (tie-break by rate: sort by value then rate, rank only by value), `streak` (bestStreak), `responder`, `decliner`, `ghost`.
- [ ] Run → PASS; full backend suite passes.

## Task 2 — Timing and per-person awards
**Files:** modify `statsAwards.js`, `statsAwards.test.mjs`.
**Consumes:** event fields added in Task 5 — `rsvpLog: {user, status, at: Date}[] | null`, `rsvpOpenDate`, `rsvpCloseDate`, `date` (start), `tierOpens: {user, opensAt}[]`, `guestsBy`/`itemsBy`: `{user, count}[] | null`, `seatsBy: {user, seats}[] | null` (null = old record). Tests build events directly.
- [ ] Tests: `quickDraw averages minutes from opening to first answer, lower wins` (answers 10, 20, 30 min → 20); `quickDraw uses tier opening and clamps at 0`; `quickDraw ignores events without rsvpOpenDate`; `quickDraw needs 3 answered logged meetups`; `buzzer counts first answers within 2h of close, falls back to start`; `weathervane counts status changes after the first, min 2`; `old records without log are ignored by timing awards` (mix null-log events; counts only logged); `plusOne/chauffeur/snackCaptain sum per-person data and are omitted when fewer than 3 events carry it`.
- [ ] Run → FAIL on first new test (award missing).
- [ ] Implement metrics for `timedAnswered`, `quickDrawMin` (rounded to 0.1), `buzzer`, `changes`, `guests`, `items`, `seats`, and the six awards in `computeAwards` using `eventsWith`.
- [ ] Run → PASS; full suite.

## Task 3 — Chat and poll awards
**Files:** modify `statsAwards.js`, `statsAwards.test.mjs`.
- [ ] Tests: `chatty needs 10 messages and is omitted when chat is null`; `voice needs 3 polls`.
- [ ] Run → FAIL. Implement. Run → PASS; full suite.

## Task 4 — RSVP log capture
**Files:** create `backend/src/utils/rsvpLog.js`, `rsvpLog.test.mjs`; modify `meetup.model.js` (add `rsvpLog: [{ user: ObjectId ref User, status: { type: String, enum: ['in','out','waitlist'] }, at: Date, _id: false }]`, default `[]`), `meetup.controller.js`; create `backend/src/controllers/stats.handlers.test.mjs` (mock setup copied from `rides.handlers.test.mjs`).
**Produces:** `appendRsvpLog(meetup, userId, status, at = new Date())` — pushes `{user, status, at}`, then trims to the newest 200.
- [ ] Tests (unit): `appends entry`; `keeps newest 200`. Handler tests: `self RSVP in then out logs two entries`; `repeat tap logs nothing`; `full meetup logs waitlist`; `admin override is not logged`; `promoted waitlister is not logged`.
- [ ] Run → FAIL.
- [ ] Implement: in `rsvpMeetup`, after the status branch and before `meetup.save()`, when `!actingAdmin` call `appendRsvpLog(meetup, user._id, <'in' | 'out' | 'waitlist' — whichever array the user ended in>)`. Inside the retry loop, so a version retry re-applies it once on the fresh document.
- [ ] Run → PASS; full suite.

## Task 5 — Archive the new fields
**Files:** modify `attendanceRecord.model.js` (add `rsvpLog` same shape, `rsvpOpenDate`, `rsvpCloseDate`, `tierOpens: [{user, opensAt, _id:false}]`, `guestsBy: [{user, count, _id:false}]`, `itemsBy`, `seatsBy: [{user, seats, _id:false}]`, each `default: undefined` so old documents read as missing), `groupStats.js`; create `groupStats.test.mjs`.
**Produces:** `toRecord(m, clerkToUserId: Map<string,string>)` fills the new fields (guests converted from clerkId; `itemsBy` counts `bringClaims` per user; `seatsBy` = drivers' `seats`; `tierOpens` flattened from `priorityTiers`). `archiveMeetups` and `loadEvents` load the clerkId map for the meetups' `guests[].userId` (one `User.find`). `loadEvents` items gain the Task 2 fields, with `null` when the record lacks them; the live-meetup `select` includes `rsvpLog rsvpOpenDate rsvpCloseDate priorityTiers bringClaims rides guests`.
- [ ] Tests: `toRecord converts guests to user ids`; `toRecord counts claims per user and driver seats`; `toRecord flattens tiers`; `loadEvents maps missing fields to null` (stub models).
- [ ] Run → FAIL. Implement. Run → PASS; full suite.

## Task 6 — Chat message counts
**Files:** create `supabase/migrations/20261110000000_chat_message_counts.sql`; modify `backend/src/utils/supabaseAdmin.js`, `supabaseAdmin.test.mjs`.
SQL:
```sql
create or replace function public.chat_message_counts(p_group_id text)
returns table (sender_id text, messages bigint)
language sql stable security invoker set search_path = public as $$
  select m.sender_id, count(*) from public.messages m
  where m.group_id = p_group_id and m.kind = 'user' and m.deleted_at is null
  group by m.sender_id
$$;
revoke all on function public.chat_message_counts(text) from public, anon, authenticated;
grant execute on function public.chat_message_counts(text) to service_role;
```
**Produces:** `chatMessageCounts(groupId, { env, fetchImpl }) → Promise<Map<clerkId, number> | null>` — POST `/rest/v1/rpc/chat_message_counts`; `null` when not configured or on any error (logged).
- [ ] Tests: `returns null when not configured`; `maps rows to counts`; `returns null on HTTP error`.
- [ ] Run → FAIL. Implement. Run → PASS; full suite.

## Task 7 — Assemble and shape the response
**Files:** create `backend/src/utils/statsVisibility.js`, `statsVisibility.test.mjs`; modify `groupStats.js`, `group.controller.js` (`getGroupStats`); extend `stats.handlers.test.mjs`.
**Produces:**
- `buildGroupStats(group, opts)` additionally returns `awards` (full rankings, people resolved to `{_id, firstName, lastName, profilePicture, value, rank}`), `metrics` (per member). Users are loaded with `clerkId` to map chat counts; polls via `Poll.find({ group: group._id, status: { $ne: 'cancelled' } }).select('options.voters').lean()`; `members[]` items gain `bestStreak`.
- `shapeStatsForViewer(full, { viewerId, isOrganizer, revealJokes }) → GroupStats JSON`: `awards[]` = `{ key, title, emoji, joke, lowerIsBetter, winners, leaderboard (top 5) }`, joke awards removed unless `isOrganizer || revealJokes`; `members[]` other people's `declined`/`noResponse` → `null` unless visible; `me = { _id, categories: [{ key, value, rank, of }] }` for every award key present in the full result, joke ranks `null` unless visible; `viewer = { isOrganizer, jokesVisible, revealJokes }`; `metrics` stripped.
- `getGroupStats` passes `isOrganizer = canManageGroup(user._id, group)`, `revealJokes = group.statsRevealJokes === true`.
- [ ] Tests (unit): `organizer sees joke awards`; `revealed shows joke awards to members`; `member response hides joke data` (assert `JSON.stringify(result)` contains neither `"decliner"` nor another member's declined count, while own values remain); `me ranks joke categories only when visible`; `leaderboard is top 5`. Handler: `former members are not ranked` (archive contains a user not in `group.members`).
- [ ] Run → FAIL. Implement. Run → PASS; full suite.

## Task 8 — Reveal setting
**Files:** modify `group.model.js` (`statsRevealJokes: { type: Boolean, default: false }`), `group.controller.js` (`updateStatsSettings`), `group.route.js` (`router.patch("/:groupId/stats-settings", protectRoute, updateStatsSettings)`); extend `stats.handlers.test.mjs`.
**Produces:** `PATCH /api/groups/:groupId/stats-settings` body `{ revealJokes: boolean }` → `200 { revealJokes }`; `400` if not boolean; `403` unless `canManageGroup`; `404` unknown group.
- [ ] Tests: `moderator can reveal`; `member gets 403`; `non-boolean gets 400`.
- [ ] Run → FAIL. Implement. Run → PASS; full suite.

## Task 9 — Account-deletion cleanup
**Files:** modify `user.controller.js` (`deleteAccount`, next to the existing `Poll.updateMany` cleanup); extend `stats.handlers.test.mjs`.
- [ ] Test: `deleteAccount pulls the user from rsvpLog and archived per-person data` (stub `Meetup.updateMany` / `AttendanceRecord.updateMany`, assert filters and `$pull` for `rsvpLog`, `guestsBy`, `itemsBy`, `seatsBy`, `tierOpens` by `user: userId`).
- [ ] Run → FAIL. Implement `Meetup.updateMany({ 'rsvpLog.user': userId }, { $pull: { rsvpLog: { user: userId } } })` and one `AttendanceRecord.updateMany` with the five `$pull`s. Run → PASS; full suite.

## Task 10 — App types and formatting
**Files:** modify `mobile/utils/api.ts`; create `mobile/utils/statsFormat.ts`, `mobile/utils/__tests__/statsFormat.test.ts`.
**Produces:** types `AwardKey`, `StatsPerson { _id; firstName?; lastName?; profilePicture?; value: number; rank: number }`, `StatsAward { key; title; emoji; joke; lowerIsBetter; winners: StatsPerson[]; leaderboard: StatsPerson[] }`; `GroupStats` gains `awards`, `me`, `viewer`, members' `declined`/`noResponse: number | null`, `bestStreak`. `groupApi.updateStatsSettings(api, groupId, revealJokes): Promise<{ revealJokes: boolean }>`. `formatAwardValue(key, value)`, `formatRank(rank, of)`, `AWARD_BLURBS: Record<AwardKey, string>`.
- [ ] Tests: `reliable 1 → "1 meetup", 12 → "12 meetups"`; `streak 8 → "8 in a row"`; `quickDraw 4 → "4 min avg", 150 → "2.5 hr avg", 2880 → "2 days avg"`; `chatty 312 → "312 messages"`; `formatRank(2, 9) → "#2 of 9"`, `formatRank(null, 9) → "—"`.
- [ ] Run `npx jest utils/__tests__/statsFormat.test.ts` → FAIL. Implement. Run → PASS; `npx tsc --noEmit` clean (the existing screen still compiles with the nullable fields — fix its `memberSub` text to skip null parts).

## Task 11 — Screen
**Files:** create `mobile/components/stats/AwardCard.tsx` (props `award: StatsAward; onPress`), `AwardSheet.tsx` (props `award: StatsAward | null; onClose`; Modal sheet like `OptionPickerModal`, lists leaderboard with rank, avatar, name, `formatAwardValue`, and `AWARD_BLURBS[key]`), `YourStatsCard.tsx` (props `me`, `member` (own row), `awards`), `HallOfShame.tsx` (props `awards` (joke only), `viewer`, `onToggleReveal(next)`, `saving`); modify `mobile/app/group-stats/[id].tsx`.
Layout per spec: tiles → Your stats → Awards (2-column grid, public) → Hall of Shame (organizers: "Only organizers can see this" + `ToggleSwitch` "Reveal to the group"; members only when revealed, no switch) → Members (null rule) → History. Reveal uses `useMutation` with optimistic update of `['groupStats', id]` and rollback + toast on error. Theme tokens only; `PressableOpacity`; `accessibilityLabel` on cards ("<title>: <names>, <value>").
- [ ] `npx tsc --noEmit` clean; `statsFormat` jest still passes.
- [ ] Add the device checklist below to this plan's status section.

## Task 12 — Verify and hand over
- [ ] Full `npm test` (backend) and `npx tsc --noEmit` (mobile).
- [ ] Reread spec and this plan line by line; tick each requirement.
- [ ] Fresh reviewer (subagent) checks the change against the spec.
- [ ] Update `claude/todo.md` (project doc): what was built, files touched, ship order (Supabase migration + backend before app), device checklist.

### Device checklist
- Organizer of a Premium group: awards grid, tap → sheet, Hall of Shame visible with switch; flip reveal.
- Member of the same group: no Hall of Shame and no others' Out/no-reply until revealed; after reveal, both visible.
- A group with only old history: timing/per-person awards absent, no empty cards.
- RSVP In → Out → In on an upcoming meetup, let it finish, check Weathervane/Quick Draw later.
- Dark mode; small phone; VoiceOver/TalkBack reads award cards.

## Status
_Not started._
