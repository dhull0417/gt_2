# Ride assignments: implementation plan

**Status (2026-11-10):** Tasks 1–8 built, uncommitted in GT_2. Backend `npm test` 241/241 (run from a
local-disk copy; the OneDrive mount is too slow for the full suite in one go), including
`src/controllers/rides.handlers.test.mjs` (17 tests through the real handlers: both new endpoints, the
assignments sheet, RSVP Out, both guest routes, priority bumps, a driver leaving the group). Every handler
test and every key rule in `rides.test.mjs` was checked by removing or breaking the production code and
watching the test fail. Mobile `tsc --noEmit` clean; `utils/__tests__/rides.test.ts` (20) and the ride
cases in `notificationRouting.test.ts` pass in a minimal jest setup; run `npm test` in `mobile/` on your
machine for the full suite. Device checklist (Task 9) not run.
Changes from the plan while building: the cars UI lives in a new `components/RideCars.tsx` (rendered by
`MeetupAssignments`); its decisions (picker choices, the Join anyway prompt, the auto-assign toast) are
plain functions in `mobile/utils/rides.ts` (`pickerOptionsFor`, `resolvePick`, `autoAssignMessage`) so
they're tested; change records are `{ rider, from, to, self, guests }`; notification wording lives in
`rideNotify.js` (`rideNoticeBody`) and `mobile/utils/rides.ts` (`rideNoticeLead`); new icons in
`utils/notificationIcons.ts`.

**Goal:** Riders and their guests can be matched to drivers on a meetup by auto-assign, managers, drivers or the riders themselves.
**Architecture:** Each passenger entry in `meetup.rides` gains `driver` (where the rider sits) and `guestRides: [{ driver, count }]`
(where their guests sit). Pure helpers in `backend/src/utils/rides.js` own every rule (loads, permissions, consistency,
auto-assign with splitting, who to notify); controllers load, call them, save with the existing version-retry loop, and
notify. The app mirrors the read-side rules in `mobile/utils/rides.ts` to draw one line per person and pick the buttons.
**Tech stack:** Express + Mongoose, `node --test`; Expo/React Native, TypeScript, jest.
**Spec:** `docs/specs/2026-11-10-ride-assignments-design.md`

**Global constraints**
- Guest count comes from `meetup.guests` (keyed by clerkId). Seats per driver 0–20 (existing validation).
- Only people in `meetup.in` count; entries for anyone else are ignored on read and dropped on normalize.
- Notification types `ride-assigned`, `ride-removed`; not added to `KIND_FOR_TYPE` (never muted).
- Rider is never notified about a change they made themselves; always notified otherwise when they or a guest lose a seat.
- Zip key = first 5 digits of `user.zipCode`; anything else = unknown.
- The working tree also holds uncommitted long-interval / Premium-card work touching `meetup.model.js` and
  `mobile/utils/api.ts`. Edit only the lines listed here; don't reformat those files.

**Review focus**
1. A driver goes Out while a rider and one guest of another rider are in the car → both released, both riders notified (Task 2 + Task 5).
2. Guest count goes up while the rider or any guest is placed → `leave_ride_first`, by the rider and by a manager (Task 5).
3. Auto-assign never moves anyone placed, and splits a party only when no single car fits it (Task 2).
4. A driver tries to take a guest who is in another car → `already_assigned` (Task 2).
5. A driver leaving the group releases riders in other meetups and they get a push (Task 5, `memberCleanup`).

## File map
| File | Change |
|---|---|
| `backend/src/scripts/buildZipTable.js` | new: Gazetteer txt → JSON |
| `backend/src/data/zipCentroids.json` | new: generated data |
| `backend/src/utils/zipDistance.js` (+ `.test.mjs`) | new: `zipKey`, `coordsForZip`, `milesBetween` |
| `backend/src/utils/rides.js` (+ `.test.mjs`) | new: all ride rules |
| `backend/src/utils/rideNotify.js` | new: turns release/placement lists into pushes |
| `backend/src/models/meetup.model.js` | `rides[].driver`, `rides[].guestRides` |
| `backend/src/models/notification.model.js` | two enum values |
| `backend/src/controllers/meetup.controller.js` | new handlers; `setAssignments` and RSVP paths use the rules |
| `backend/src/routes/meetup.route.js` | two routes; guests route uses the rules |
| `backend/src/utils/priorityRsvp.js`, `memberCleanup.js` | normalize + notify |
| `mobile/utils/api.ts` | ride type; `assignRide`, `autoAssignRides` |
| `mobile/utils/rides.ts` (+ `__tests__/rides.test.ts`) | new: `buildCars`, permission helpers, join planning |
| `mobile/components/MeetupAssignments.tsx` | cars UI, picker, prompt, auto-assign |
| `mobile/components/MeetupDetailModal.tsx` | pass `canManage`; guest counter error |
| `mobile/app/notifications.tsx` | text for the two types |

---

## Task 1: Zip table and distance
**Files:** create `backend/src/scripts/buildZipTable.js`, `backend/src/data/zipCentroids.json`, `backend/src/utils/zipDistance.js`, `backend/src/utils/zipDistance.test.mjs`.
**Produces:** `zipKey(raw: string|undefined): string|null`, `coordsForZip(raw): [lat, lng]|null`, `milesBetween(a: [lat,lng], b: [lat,lng]): number`, `loadZipTable(table?)` (test hook to inject a small table).
- [x] Download `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip` to a scratch folder outside the repo, unzip.
- [x] Write `buildZipTable.js <input.txt> <output.json>`: tab-separated, header row; columns by header name `GEOID`, `INTPTLAT`, `INTPTLONG` (trim; the last header has trailing spaces); round to 4 decimals; write `{ zip: [lat, lng] }`. Run it; expect ~33,700 keys and < 1 MB.
- [x] Failing tests: `zipKey('84101-1234') === '84101'`, `zipKey(' 8410') === null`, `zipKey('') === null`; `milesBetween` Salt Lake (40.7608,-111.8910) to Provo (40.2338,-111.6585) between 36 and 40; same point 0; `coordsForZip` hits/misses against an injected table; real table contains `'84101'` and `'00601'`.
- [x] Implement (haversine, Earth radius 3958.8 mi; lazy `JSON.parse(readFileSync(...))` on first call). Run `npm test` in `backend/` → PASS. Commit.

## Task 2: Ride rules (pure)
**Files:** create `backend/src/utils/rides.js`, `backend/src/utils/rides.test.mjs`.
**Consumes:** `milesBetween` (Task 1). Ids compared with `String()`. `guestsOf(userId) => number` is passed in (built by `guestCountFn(meetup, clerkIdByUserId)`).
**Produces:**
- `guestCountFn(meetup, clerkIdByUserId) => (userId) => number`
- `carLoad(rides, driverId) => number`; `openSeats(rides, driverId) => number`
- `unplacedGuests(entry, guestsOf) => number`; `isPlaced(entry) => boolean` (rider or any guest in a car)
- `normalizeRides(rides, inIds, guestsOf) => { rides, released: [{ rider, driver, riderSelf: boolean, guests: number }] }`
- `applyAssignment(rides, { actorId, isManager, riderId, driverId, rider, guests, fromDriverId }, guestsOf) => { ok: true, rides, changes } | { ok: false, error, room? }` where `changes = [{ rider, from, to, riderSelf, guests }]`
- `setRideRole(rides, userId, ride) => { ok, rides, error? }` — passenger→passenger keeps `driver`/`guestRides`; seats below load → `seats_in_use`; `null` removes the entry (normalizer releases that driver's people).
- `autoAssign(rides, guestsOf, coordsOf) => { rides, changes, placed: number, unplaced: number }`
- `rideNotifications(changes, actorId) => [{ to, type, role: 'rider'|'driver', otherId, guests, riderSelf }]` — rider skipped when `actorId === rider`; driver skipped when `actorId === driver`.
- [x] Failing tests (one `test()` each):
  - load counts riders and guest seats in a car; unplaced guests = count − placed.
  - normalize: driver no longer In → rider and guest seats in that car released; passenger-ified driver → same; guest count lowered → last `guestRides` trimmed; over-capacity safety net releases last placed first.
  - applyAssignment: manager moves rider + 1 guest from car A to B; rider places self + 2 guests; rider "Join anyway" with room 2 → rider + 1 guest placed, 1 unplaced; driver adds unplaced guest; driver adds guest sitting in another car → `already_assigned`; driver removes from another car → `forbidden`; member edits someone else → `forbidden`; too many → `car_full` with `room`; removing more guests than in that car → `not_enough_guests`; placed entry moves to the end.
  - setRideRole: passenger keeps placements; seats below load → `seats_in_use`; driver → passenger then normalize releases their people.
  - autoAssign: nearest whole-fit car chosen; largest party first; placed people never move; guest-only party prefers rider's car; no car fits party of 4 (cars 2 and 3 open) → split rider+1 into nearest, 2 into next; unknown-zip riders last into most open seats; deterministic.
  - rideNotifications: rider not told about own change; driver not told about own change; one entry per rider and per driver.
- [x] Run → FAIL (module missing). Implement. Full backend suite → PASS. Commit.

## Task 3: Schema and notification types
**Files:** modify `backend/src/models/meetup.model.js` (rides subdocument), `backend/src/models/notification.model.js` (enum).
- [x] Add to `rides`: `driver: { type: ObjectId, ref: "User", default: null }`, `guestRides: [{ driver: { type: ObjectId, ref: "User" }, count: { type: Number, min: 1 }, _id: false }]`.
- [x] Add `'ride-assigned', 'ride-removed'` to the notification `type` enum.
- [x] Backend suite → PASS. Commit.

## Task 4: Notifications helper and new endpoints
**Files:** create `backend/src/utils/rideNotify.js`; modify `backend/src/controllers/meetup.controller.js`, `backend/src/routes/meetup.route.js`.
**Consumes:** Task 2, `canManageGroup`, `groupHasPremium`, `loadClerkIds`, `notifyAndPersist`, `coordsForZip`.
**Produces:** `notifyRideChanges(meetup, changes, actorId)` (loads users, sends via `notifyAndPersist` with `meta: { role, otherName, guests, riderSelf }`, catches and logs errors); `assignRide`; `autoAssignRides`.
- [x] `notifyRideChanges`: bodies — rider placed: "You're riding with Sam to Meetup" (guests only: "2 of your guests are riding with Sam"); rider released: "You no longer have a ride to Meetup" (guests only: "2 of your guests no longer have a ride"); driver gained: "Ana is riding with you" / "Ana's 2 guests are riding with you"; driver lost: "Ana is no longer riding with you".
- [x] `assignRide`: validate body (`rider` boolean, `guests` integer 0–20, at least one person); load meetup + group; 404 / 400 (`status !== 'scheduled'`, `!ridesEnabled`) / premium 403; `isManager = canManageGroup(requester._id, group)`; `applyAssignment` (403 for `forbidden`, 409 otherwise, pass `room`); `normalizeRides`; `increment()` + version-retry save (copy `setAssignments`); notify; respond `{ meetup }` populated like `setAssignments`.
- [x] `autoAssignRides`: managers only; load riders' and drivers' `zipCode`; `autoAssign`; save with retry (recompute each attempt); notify; respond `{ meetup, placed, unplaced }`.
- [x] Register routes with `protectRoute` beside `/:meetupId/assignments`. Backend suite → PASS. Commit.

## Task 5: Keep assignments consistent in existing paths
**Files:** modify `meetup.controller.js` (`setAssignments`, RSVP handler), `routes/meetup.route.js` (guests route), `utils/priorityRsvp.js`, `utils/memberCleanup.js`.
- [x] Failing test in `rides.test.mjs`: `guestIncreaseBlocked(rides, userId) => boolean` (true when `isPlaced`). Implement → PASS.
- [x] `setAssignments`: use `setRideRole` (409 `seats_in_use`, "N people are riding with you. Take someone out first."), then `normalizeRides`; notify released (actor = requester).
- [x] RSVP handler: if the request raises the guest count and `guestIncreaseBlocked` → 409 `leave_ride_first`. After existing `rides` filters and guest changes, `normalizeRides`; notify released (rider going Out themselves is `riderSelf`, so no push to them; their driver still gets one).
- [x] Guests route: same `leave_ride_first` check on increase; `normalizeRides` before save; notify.
- [x] `priorityRsvp.js`: after the `bumped` filter, `normalizeRides`; after save, notify released.
- [x] `memberCleanup.js`: before the `updateMany`, find upcoming meetups in scope where the user is a driver with people (`rides.driver` or `rides.guestRides.driver` = userId) or a rider in someone's car; after the pull, reload those, `normalizeRides`, save, notify released (actor = the leaving user, so they get nothing).
- [x] Backend suite → PASS. Commit.

## Task 6: App data layer
**Files:** modify `mobile/utils/api.ts`; create `mobile/utils/rides.ts`, `mobile/utils/__tests__/rides.test.ts`.
**Produces:**
- ride type `{ user; role; seats; driver?: string | null; guestRides?: { driver: string; count: number }[] }`
- `meetupApi.assignRide(api, meetupId, body)` (body as in the spec), `meetupApi.autoAssignRides(api, meetupId)`
- `type PersonLine = { key: string; riderId: string; isGuest: boolean; guestIndex: number /* 0 = rider */; label: string }`
- `buildCars(meetup, currentUserId) => { cars: { driverId, seats, open, lines: PersonLine[] }[]; waiting: PersonLine[] }` (labels "You", "Ana", "Ana's guest", "Ana's guest 2"; In only; stale placements shown as waiting)
- `lineActions({ meetup, me, isManager, line }) => { targets: { driverId, open }[]; canRemove: boolean }`
- `planJoin(meetup, riderId, driverId) => { fitsAll: boolean; guests: number }` (guests that fit beside the rider)
- `canAutoAssign(meetup, isManager) => boolean`
- [x] Failing jest tests: lines per person (rider with 2 guests split over two cars shows 1+1 and 1); waiting list includes unplaced guests; driver gets no targets for a line in another car; rider sees only cars with ≥ 1 open; `planJoin` for room 2 with 3 guests → `{ fitsAll: false, guests: 1 }`; `canAutoAssign` false with no open seats. Run → FAIL. Implement → PASS. `tsc` clean. Commit.

## Task 7: Rides UI
**Files:** modify `mobile/components/MeetupAssignments.tsx`, `mobile/components/MeetupDetailModal.tsx`.
- [x] `MeetupAssignments` gets `canManage: boolean`; pass it from `MeetupDetailModal`.
- [x] Replace driver lines / "Needs a ride" with cars from `buildCars`: driver row (truck icon, name or "You", "N open"), one line per person; then "Still needs a ride" lines. Highlight the current user's lines. Keep the seat-balance pill.
- [x] Auto-assign button (when `canAutoAssign`): spinner, `onUpdated`, toast `Placed X people.` + ` Y still need a ride.`.
- [x] Tapping a line with any action opens `OptionPickerModal` (title = line label): "Ride with Sam (2 open)" per target, "Take out of car" when `canRemove`. A rider line moves the rider; a guest line moves one guest (`fromDriverId` = its car). When the current user picks a car for their own unplaced party and `planJoin().fitsAll` is false, show an Alert with the spec's wording and buttons **Join anyway** / **Don't join**.
- [x] 409 → toast with the server message + `onStale()`; `car_full` during Join anyway → refetch and re-prompt once.
- [x] Guest counter in `MeetupDetailModal`: show the `leave_ride_first` message as a toast.
- [x] `tsc` clean, full mobile jest PASS. Commit.

## Task 8: Notifications screen
**Files:** modify `mobile/app/notifications.tsx`.
- [x] Text for `ride-assigned` / `ride-removed` from `meta.role`, `meta.otherName`, `meta.guests` (rider vs driver; whole party vs guests only), mirroring the push bodies in Task 4.
- [x] `notificationRouting` test that both types open the meetup. `tsc` + jest PASS. Commit.

## Task 9: Verify
- [ ] Reread the spec line by line against the code; full backend and mobile suites; `tsc`.
- [ ] Device checklist (Premium group, rides on, 3 drivers with different zips, 5 riders, one with 2 guests):
  - Auto-assign as owner: nearest grouping, big party placed or split when nothing fits, toast counts, pushes received.
  - Run auto-assign again: nobody moves.
  - Moderator moves a rider; driver adds and removes; rider picks and leaves a car.
  - Driver goes Out → riders back in "Still needs a ride" with a push.
  - Rider in a car tries to add a guest → blocked with the message; leaves, adds, rejoins with Join anyway → split shows one line per person.
  - Driver leaves the group → riders in that driver's cars get a push.
  - Driver lowers seats below their riders → blocked with the message.
  - Dark mode; member without Premium group sees nothing new.
- [ ] Ship backend before the app build.
