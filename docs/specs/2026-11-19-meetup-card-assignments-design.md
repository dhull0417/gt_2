# Assignments on the meetup card — design

**Date:** 2026-11-19 · **Size:** small change · **Status:** approved 2026-11-19 · implemented (`cardAssignmentLines` in `mobile/utils/assignments.ts`, line in `mobile/components/MeetupCard.tsx`)

## Intent
The Assignments card is off the meetup modal, so give the meetup card in the list a one-line glance at assignments. Keep it minimal: group status until you've chosen, then only your own choices. Display only; tapping the card still opens the modal.

## Decisions
- **(Dalli)** One line, directly under the meetup name (above the description).
- **(Dalli)** Until you've made any selection (an item or a ride role), the line shows the group overview. Once you have, it shows only your selections.
- **(Dalli)** As a driver it reads `Driving (2 riders)` / `Driving (1 rider)`, or `Driving (Select riders)` when no one is in your car yet.
- **(my call)** Group overview parts, joined with ` · `: `2 seats open` or `3 seats needed` (only once someone has picked driver/passenger), and `1 item needed` / `2 items needed` (items with a limit that still have open slots). Hidden if neither applies.
- **(Dalli, 2026-11-19)** Your selections go on up to two lines: your ride on the first (`Driving (…)`, `Riding with Sam`, or `Needs ride` as a passenger with no car yet), what you're bringing on the second (`Chips, Cones`). Each line is cut off with "…" if it's too long.
- **(my call)** Look: 13px, weight 600, `colors.textMuted`, a small leading Feather icon (`truck` when the line starts with a ride, `shopping-bag` for items only, `clipboard` for the group overview). No pills, no colors.
- **(my call)** Shown only when assignments are active (`assignmentsActive`) and the meetup isn't past or cancelled. Your selections only count while you're In (same as the modal).
- "Select riders" is a label only: the card isn't tappable for it, and drivers don't pick riders in-app today.
- Numbers come from `summarizeAssignments` / `buildCars`, so the card and modal agree. No server or API change.

## Non-goals
Tapping the line; other people's assignments; changing the modal.

## Testing
Jest unit tests for one pure helper `cardAssignmentLine(meetup, userId): { icon, text } | null` in `utils/assignments.ts`: group overview (seats open / needed, items needed singular/plural, hidden when nothing to say); driver with 0 / 1 / 2 riders; passenger placed / waiting; items only; ride + items; not In → overview; inactive assignments → null.
Manual check of the card in light and dark mode on iOS and Android.
