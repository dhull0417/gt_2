# Assignments off the meetup modal — implementation plan

**Goal:** Remove the Assignments card from `MeetupDetailModal`; open your assignments from your own tile/pills, show a driver's riders from the driver pill, let a ride role be unselected, and move tourney "Set up" into the ⋯ sheet.
**Architecture:** Small pure helpers (in `utils/assignments.ts`, `utils/rides.ts`, new `utils/meetupActions.ts`) carry the testable logic. `ActionSheet` gains an optional title and display-only rows so it doubles as the riders sheet. `MeetupDetailModal` owns the self `AssignmentsSheet` and riders-sheet state; the `<MeetupAssignments>` card and the "Set up" state of `MeetupTournamentCard` are dropped.
**Tech stack:** React Native (Expo 54), TypeScript, Jest + jest-expo + @testing-library/react-native.
**Spec:** `docs/specs/2026-11-19-assignments-off-modal-design.md`

**Global constraints**
- No new dependencies, no server changes.
- Riders sheet title: `Riding with {firstName}` / `Riding with you`; empty row text `No one riding yet`.
- Actions row: key `tourney`, label `Set up Teams & Tourneys`, Feather `users` #7C3AED, bg `isDark ? '#2A1F45' : '#F5F3FF'`, last in the list; navigates to `/tournament-setup/[meetupId]` with `{ meetupId, groupId }` via `leaveTo`.
- Driver-with-riders refusal stays server-side; the sheet just shows the server's message.

**Review focus**
1. Someone In with no selection can still open the sheet → own tile pressable when In; Task 5 manual check + `canEditOwnAssignments` test in Task 1.
2. Waitlisted / Out / past meetup can't open it → `canEditOwnAssignments` returns false for each (Task 1).
3. Unselecting a role then Save sends `ride: null`, not omitted → `rideBody(null, 0)` test (Task 1).
4. Questions still open after RSVP In when assignments are active → Task 5 manual check (modal too heavy to render).
5. Driver pill tap doesn't also fire the tile tap → pill is its own `PressableOpacity` inside the tile (RN stops propagation); Task 5 manual check.

## File map
- Modify `mobile/utils/assignments.ts` — `nextRole`, `rideBody`, `canEditOwnAssignments`.
- Modify `mobile/utils/rides.ts` — `ridersOf`.
- Create `mobile/utils/meetupActions.ts` — `showTourneySetup`.
- Modify `mobile/components/ActionSheet.tsx` — `title?`, `onPress?`.
- Modify `mobile/components/MeetupAssignments.tsx` — `AssignmentsSheet` uses `nextRole` / `rideBody`; Save no longer blocked on role.
- Modify `mobile/components/MeetupTournamentCard.tsx` — return null instead of the "Set up" card.
- Modify `mobile/components/MeetupDetailModal.tsx` — wiring.
- Tests: `mobile/utils/__tests__/assignments.test.ts`, `mobile/utils/__tests__/rides.test.ts`, `mobile/utils/__tests__/meetupActions.test.ts` (new), `mobile/components/__tests__/ActionSheet.test.tsx`.

## Task 1: Assignment helpers
**Produces** (in `utils/assignments.ts`):
- `nextRole(current: 'driver'|'passenger'|null, tapped: 'driver'|'passenger'): 'driver'|'passenger'|null`
- `rideBody(role, seats: number): { role: 'driver'; seats: number } | { role: 'passenger' } | null`
- `canEditOwnAssignments(meetup: Meetup, userId: string, readOnly: boolean): boolean` — true only when `assignmentsActive`, user is in `meetup.in`, and `!readOnly`.
- [x] Tests: `nextRole('driver','driver')` → null; `nextRole(null,'driver')` → 'driver'; `nextRole('driver','passenger')` → 'passenger'. `rideBody(null,3)` → null; `rideBody('driver',3)` → `{role:'driver',seats:3}`; `rideBody('passenger',3)` → `{role:'passenger'}`. `canEditOwnAssignments`: In → true; Out / waitlisted / undecided → false; In but readOnly → false; In but `group.isPremium === false` → false.
- [x] Run `npx jest utils/__tests__/assignments.test.ts` → FAIL (`nextRole is not a function`).
- [x] Implement → PASS.

## Task 2: `ridersOf`
**Produces** (in `utils/rides.ts`): `ridersOf(meetup: Meetup, driverId: string, me: string): PersonLine[]` — the `lines` of the car whose `driverId` matches in `buildCars(meetup, me)`, or `[]`.
- [x] Tests (reuse fixtures in `rides.test.ts`): a driver with one rider who has 1 guest → labels `['Sam', "Sam's guest"]`; when `me` is the rider → `['You', 'Your guest']`; a driver with nobody → `[]`; an unknown id → `[]`.
- [x] Run → FAIL. Implement → PASS.

## Task 3: `showTourneySetup`
**Produces** `utils/meetupActions.ts`: `showTourneySetup({ canManage, meetup, tournament }: { canManage: boolean; meetup: Meetup; tournament: unknown }): boolean` — `canManage && meetup.group?.isPremium !== false && meetup.status === 'scheduled' && tournament === null` (mirrors the card: `undefined` = still loading → false).
- [x] Tests: all conditions → true; each of not-manager / `isPremium:false` / `status:'past'` / tournament object / `undefined` → false.
- [x] Run → FAIL. Implement → PASS.

## Task 4: ActionSheet title and display-only rows
**Changes:** `ActionSheetItem.onPress?: () => void`; `Props.title?: string`. Title renders under the handle (16px, weight 800, `colors.textPrimary`, paddingHorizontal 20, marginBottom 4). A row without `onPress` is a plain `View` (same layout) and doesn't close the sheet.
- [x] Tests: `renders a title` → `getByText('Riding with Sam')`; `a row without onPress does not close` → pressing its text leaves `onClose` uncalled. Existing tests still pass.
- [x] Run → FAIL. Implement → PASS.

## Task 5: Wire up the modal
**Consumes:** Tasks 1–4.
- [x] `AssignmentsSheet`: role buttons call `setRole(r => nextRole(r, tapped))`; body uses `rideBody(role, seats)`; Save disabled only while saving (drop `needsRole`).
- [x] `MeetupTournamentCard`: in the `!t` branch, `return null`.
- [x] `MeetupDetailModal`:
  - Remove `<MeetupAssignments …/>`, its import (keep `AssignmentsSheet`), `assignmentsSignal`, `questionsAfterAssignments`; in `performRsvp` delete the assignments branch so the questions branch runs alone.
  - State `selfAssignOpen: boolean`, `ridersOf: string | null` (driver id). Render a second `<AssignmentsSheet visible={selfAssignOpen} forUser={undefined} …>` with the same `onUpdated` / `onStale` as the manager one.
  - `renderUserTile`: for self, if `canEditOwnAssignments(meetup, currentUser._id, isReadOnly)` wrap in `PressableOpacity` with `onPress={() => setSelfAssignOpen(true)}` and `accessibilityLabel="Edit my assignments"`; else plain `View` as today.
  - `renderAssignmentPills`: the driver pill becomes a `PressableOpacity` (`accessibilityLabel="See who's riding"`, hitSlop 6) with `onPress={() => setRidersOf(userId)}`; other pills unchanged.
  - Riders sheet: `<ActionSheet visible={!!ridersOf} title={…} items={…}>` built from `ridersOf(meetup, id, currentUser._id)`: Feather `user` / `user-plus` 18 `colors.textMuted`, bg `colors.surfaceAlt`, no `onPress`; empty → one row `No one riding yet`.
  - Read the tournament with `useQuery({ queryKey: ['tournamentForMeetup', meetup._id], queryFn: () => tournamentApi.getForMeetup(api, meetup._id), staleTime: 15000 })`; append the `tourney` item when `showTourneySetup(...)`.
- [x] `npx tsc --noEmit` → no new errors. Full `npm test` → PASS.

**Verification (2026-11-19):** `tsc --noEmit` clean; full Jest suite 62/62 suites pass (run in shards with `--roots` because a single full run exceeds the 3-minute shell limit on the OneDrive folder). ESLint not installed locally — not run. Commits left for Dalli.

## Task 6: Device check
- [ ] No Assignments card; RSVP In doesn't pop up assignments but does pop up Questions when they apply.
- [ ] Own tile (with and without pills) opens the sheet; not when Out, waitlisted, or past.
- [ ] Tap "I'm driving" twice → unselected → Save removes the Driver pill. With a rider in the car → server message shown, pill stays.
- [ ] Driver pill (yours and someone else's) → riders sheet, no DM / edit sheet behind it.
- [ ] ⋯ shows "Set up Teams & Tourneys" for owner/mod before a tourney exists; not for members, not after; tourney card shows once it exists.
- [ ] iOS + Android, light + dark.
