# Past Meetups + Members invite/search — implementation plan

**Goal:** Archive full past-meetup details (location, items + who, cars), expose them through two member-only endpoints, show them via a Past Meetups tile → list → read-only detail, and add an invite bar + search to the Members page.

**Architecture:** `toRecord` (backend/src/utils/groupStats.js) writes the extra fields into AttendanceRecord. A new `utils/pastMeetups.js` merges archived records with live expired meetups and shapes list rows / detail; thin handlers in `group.controller.js` do auth. Mobile adds API calls, a tile, two routes, and pure helpers for display/search.

**Tech stack:** Express + Mongoose, `node --test` with module mocks (backend); Expo 54 / expo-router / TanStack Query / jest-expo (mobile).

**Specs:** `docs/specs/2026-11-18-past-meetups-design.md`, `docs/specs/2026-11-18-members-invite-search-design.md`

**Global constraints**
- New AttendanceRecord fields have `default: undefined` (old records read as "not recorded", not empty).
- Undecided = members − in − out − waitlist.
- List: newest first, `limit` default 20, max 50; paging by `before` (ISO date of the last row).
- Endpoints: 404 group/user missing, 403 non-member. Not premium-gated.
- Cancelled meetups never listed.
- Tile order: invite, calendar, meetups, past, members, schedule, settings.
- Backend tests: `npm test` in backend/. Mobile: `npx jest --forceExit`, `npx tsc --noEmit`. (Run in my workspace; the OneDrive folder is too slow for test runners.)

**Review focus**
1. A meetup both archived and still live is listed once (archive wins) — test in Task 2.
2. A rider whose driver isn't a driver any more (dangling `driver`) lands in `needsRide`, not a phantom car — test in Task 1.
3. Claims for an item since removed from `bringItems` are dropped, not shown as "undefined" — test in Task 1.
4. A user who has since deleted their account shows as "Former member" — test in Task 2.
5. Search with leading/trailing spaces and mixed case still matches — test in Task 7.

## Task 1 — Archive the extra fields (backend)
**Files:** `backend/src/models/attendanceRecord.model.js`, `backend/src/utils/groupStats.js`, `backend/src/utils/groupStats.test.mjs`
**Produces:** record fields `location`, `items: [{ name, by: [id] }]`, `cars: [{ driver, seats, riders: [id], guests }]`, `needsRide: [id]`.
- [x] Tests: `ARCHIVE_FIELDS` includes `location` and `bringItems`; `toRecord` copies `location`; groups claims into `items` by item in `bringItems` order, skipping unclaimed and unknown items; builds one car per driver with riders whose `driver` matches and guest counts from `guestRides`; passengers with no/unknown driver go to `needsRide`; meetup with no `bringItems`/`rides` gives `items: []`, `cars: []`, `needsRide: []`.
- [x] Run → FAIL. Implement (schema fields + `toRecord`). Run → PASS; `npm test`.

## Task 2 — Past meetups data (backend)
**Files:** create `backend/src/utils/pastMeetups.js`, `backend/src/utils/pastMeetups.test.mjs`
**Produces:**
- `listPastMeetups(groupId, { before?: Date, limit?: number }) → { meetups: Row[], nextBefore: string|null }`, `Row = { id, name, date, location, inCount, outCount, undecidedCount, hasTournament }`
- `getPastMeetup(groupId, meetupId) → Detail|null`, `Detail = { id, name, date, location, in: Person[], out: Person[], undecided: Person[], waitlist: Person[], guestsBy: {userId,count}[], items: {name, by: Person[]}[] | null, cars: {driver: Person, seats, riders: Person[], guests}[] | null, needsRide: Person[] | null, tournament: { id, format, mode, status, champion: string|null } | null }`, `Person = { _id, firstName, lastName, profilePicture, former?: true }`
- [x] Tests (models stubbed like stats.handlers.test): merges archived + live expired, archive wins on duplicate; newest first; `before`/`limit` paging and `nextBefore`; counts incl. undecided; `hasTournament`; detail populates people, missing user → `{ firstName: 'Former member', former: true }`; old record without items/cars → `null` sections; tournament champion label via existing `teamLabel`/`loadNames`; wrong group → null.
- [x] Run → FAIL. Implement. Run → PASS; `npm test`.

## Task 3 — Endpoints (backend)
**Files:** `backend/src/controllers/group.controller.js` (+ `getPastMeetups`, `getPastMeetupDetail`), `backend/src/routes/group.route.js`, create `backend/src/controllers/pastMeetups.handlers.test.mjs`
- [x] Tests: member gets list (200) and detail (200); non-member 403; unknown group 404; unknown meetup 404; `limit=500` capped at 50.
- [x] Run → FAIL. Implement; routes `GET /:groupId/past-meetups`, `GET /:groupId/past-meetups/:meetupId` (protectRoute), registered before any `/:groupId/:x` catch-alls. Run → PASS; `npm test`.

## Task 4 — Mobile API + tile
**Files:** `mobile/utils/api.ts` (types `PastMeetupRow`, `PastMeetupDetail`, `PastPerson`; `groupApi.getPastMeetups(api, groupId, before?)`, `groupApi.getPastMeetup(api, groupId, meetupId)`), `mobile/utils/groupDetailTiles.ts` (+`'past'`), its test, `mobile/components/GroupDetailsView.tsx`
- [x] Update test: tile order includes `past` after `meetups` (managers 7, members 6, DMs 0).
- [x] Run → FAIL. Implement; GroupDetailsView adds tile `{ icon: 'rotate-ccw', label: 'Past Meetups', tint: slate }` → push `/group-past-meetups/[id]`. Run → PASS; tsc.

## Task 5 — Past meetups list screen
**Files:** create `mobile/app/group-past-meetups/[id].tsx`, `mobile/app/group-past-meetups/_layout.tsx`, `mobile/utils/pastMeetups.ts` (+ test); modify `mobile/app/_layout.tsx`
**Produces:** `attendanceLine(row) → string` ("8 in · 2 out · 3 undecided", zero parts dropped, all zero → "No RSVPs").
- [x] Test `attendanceLine`. FAIL → implement → PASS.
- [x] Screen: `useInfiniteQuery(['pastMeetups', id])`, FlatList rows (name, date via `toLocaleDateString`, location, attendance line, trophy icon if `hasTournament`), empty state "No past meetups yet", offline/error states, pull to refresh, tap → `/past-meetup/[id]?groupId=`. Register both new segments in `_layout.tsx` (allowed list + `Stack.Screen`). tsc clean.

## Task 6 — Past meetup detail screen
**Files:** create `mobile/components/PastMeetupDetailView.tsx` (+ test), `mobile/app/past-meetup/[id].tsx`, `mobile/app/past-meetup/_layout.tsx`
**Interface:** `PastMeetupDetailView({ detail: PastMeetupDetail; onOpenTournament: (id: string) => void })`
- [x] Tests: shows name, location, In/Out/Undecided with counts and names; Waitlist only when non-empty; Items section lists "Chips — Ann, Bo"; Cars section shows driver, riders, "+2 guests"; Needs a ride list; sections hidden when `null`/empty; tournament "See results" calls `onOpenTournament` with id; champion line shown.
- [x] FAIL → implement → PASS. Screen wraps it with `useQuery(['pastMeetup', groupId, id])`, back header, loading/offline/error; `onOpenTournament` → push `/tournament/[id]`. tsc clean.

## Task 7 — Members page invite bar + search
**Files:** `mobile/utils/groupDetailTiles.ts` (+ `filterMembersByQuery(members, query)`), its test, `mobile/components/GroupMembersList.tsx` (+ optional `query` prop, empty-state text), its test, `mobile/app/group-members/[id].tsx`
- [x] Tests: `filterMembersByQuery` matches first, last, full name, case/space-insensitive, empty query returns all; GroupMembersList with `query="av"` shows only matching names, counts reflect filter, hides empty section, shows `No members match "zz"` when none.
- [x] FAIL → implement → PASS. Screen: teal "Invite Members" bar → `/group-invite/[id]`, then a `TextInput` search with clear button, both above the list inside the ScrollView. tsc clean.

## Task 8 — Verify
- [x] Backend `npm test`, mobile `npx jest`, `npx tsc --noEmit` all clean.
- [x] Reread both specs line by line.
- [ ] Manual (you): deploy backend; Past Meetups tile → list → detail for a recent meetup (full) and an old one (attendance only); tournament "See results"; members invite bar + search.

No commits until you say.
