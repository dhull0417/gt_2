# Assignments off the meetup modal — design

**Date:** 2026-11-19 · **Size:** small change · **Status:** approved with changes (2026-11-19)

## Intent
The Assignments card makes the meetup modal long. Take it off and make your own assignments reachable from your tile in the In grid. Also move tourney "Set up" into the ⋯ actions sheet. Dalli will decide later what group-wide info (if any) comes back.

## Decisions
- **(Dalli)** Remove the `<MeetupAssignments>` card from `MeetupDetailModal` for everyone, whether or not they've made a selection. That also removes the "Bringing" overview, the seat-balance pill and `RideCars` (car lists, waiting list, Auto-assign, joining/moving cars) from the modal for now. `MeetupAssignments.tsx` and `RideCars.tsx` stay in the repo, unused by the modal.
- **(Dalli)** Tapping your own assignment pills under your name opens the existing `AssignmentsSheet` ("What are you bringing? / Getting there").
- **(Dalli)** In `AssignmentsSheet`, tapping the selected ride role ("I'm driving" / "I need a ride") again unselects it. Saving with no role sends `ride: null`, which removes your ride. Save is no longer blocked when no role is picked.
- **(Dalli)** Tapping a driver pill (`Driver · N`) opens a small bottom sheet in the `ActionSheet` style listing who's riding with that driver (riders and their guests, from `buildCars`). Rows are display-only.
- **(Dalli)** Tourney "Set up" moves into the ⋯ actions sheet as "Set up Teams & Tourneys", shown under the same conditions as today's card (owner/mod, Premium, scheduled, no tournament yet). It goes last in the list.
- **(my call)** Your whole tile (not only the pills) opens `AssignmentsSheet` when you're In, assignments are active and the meetup isn't past/cancelled. Without this, someone with no selection would have no way in.
- **(my call)** Driver pills are tappable on everyone's tile, not just yours. The pill tap takes priority over the tile tap (so on someone else's tile it shows riders instead of the DM sheet; on yours it shows riders instead of the edit sheet).
- **(my call)** Riders sheet: title "Riding with {name}" ("Riding with you" for yourself), one row per person with a user / user-plus icon; empty state "No one riding yet".
- **(Dalli)** No auto-open: RSVPing "I'm In" no longer pops up the assignments sheet. The modal owns the `AssignmentsSheet` state directly instead of through the card.
- **(my call)** Because the assignments sheet no longer opens first, the Questions sheet opens right after RSVPing "I'm In" under its existing conditions (questions active, none answered, not waitlisted). The `assignmentsSignal` / `questionsAfterAssignments` plumbing is removed.
- **(Dalli)** The existing-tournament card (your team, next match, See Results) stays on the modal; only the "Set up" state of `MeetupTournamentCard` is removed. The modal reads the tournament with the same React Query key (`['tournamentForMeetup', id]`) to decide whether to show the row.
- **(my call)** `ActionSheet` gains an optional `title` and items with optional `onPress` (no `onPress` = plain row, no close-on-tap), so the riders sheet reuses it rather than adding a new component.
- Owner/mod "Edit Assignments" in the person sheet stays as is.

## Driver with riders (intended)
**(Dalli)** Riders must be taken out before a driver can unselect driving. The server already refuses to drop a driver who still has riders ("N people are riding with you. Take someone out first."). With `RideCars` gone from the modal there's no in-app way to take riders out, so such a driver can't unselect driving until that comes back; that's accepted. The sheet shows the server's message. No server change.

## Non-goals
A replacement for the group overview, joining a car as a passenger, and Auto-assign; changes to the server.

## Testing
Jest + RNTL:
- `ActionSheet`: renders `title`; a row without `onPress` doesn't close the sheet.
- `AssignmentsSheet`: tapping the selected role unselects it; Save with no role sends `ride: null`.
- A pure helper `ridersOf(meetup, driverId, me)` in `utils/rides.ts` returns the riders' labels (including guests and "You").
- An actions-items helper includes the tourney row only when the conditions hold.
Manual check: the modal has no Assignments card, own tile/pill opens the sheet, driver pill opens riders, ⋯ shows Set up, on iOS and Android.
