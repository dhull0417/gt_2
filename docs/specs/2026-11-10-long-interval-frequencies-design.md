# Quarterly, Semi-annually and Yearly schedule frequencies — design

_2026-11-10. Status: draft, awaiting approval._

## Intent
Some groups meet less often than monthly: a quarterly board meeting, a twice-a-year
reunion, a yearly party. Today the longest option is Monthly, so organizers fake it with
one-off meetups. Add **Quarterly**, **Semi-annually** and **Yearly** as real recurring
frequencies.

## Size
Medium project: roughly 15–20 files across backend and app, most of the UI work in the two
schedule screens (`components/create-group/ScheduleScreen.tsx`, `app/group-edit-schedule/[id].tsx`).

## Goals
- Three new choices in the frequency picker and in the Multiple Rules builder.
- The organizer picks the **first date** on a calendar; the series repeats every 3, 6 or 12
  months from that date. *(owner's call)*
- They choose how it repeats: **same date** ("the 15th") or **same weekday** ("the 3rd
  Thursday"), both derived from the picked date. *(owner's call)*
- **One first date per series.** More dates → Multiple Rules. *(owner's call)*
- Everything that already varies by frequency gets sensible values for the new ones.

## Non-goals
- A general "every N months" picker.
- Changing how Monthly, Ordinal, Weekly, Bi-Weekly or Daily behave.
- RRULEs in the calendar feed (it lists individual meetups today and keeps doing so).

## Anti-goals
- An old 1.3.x app must never silently turn one of these series into something else.

## Approach (picked: A)
**A. Three new frequency values** `quarterly`, `semiannual`, `yearly`. *(owner's call)*
Rejected **B** (keep `monthly` + an interval number): old apps would show and re-save these
as Monthly, adding up to 11 meetups a year, and every frequency check in the code would also
need to check the interval.

## Data shape
Routine (Mongo `routineSchema`, app `ScheduleRoutine`):
```
{ frequency: 'quarterly' | 'semiannual' | 'yearly',
  repeatBy: 'date' | 'weekday',              // new optional field; only used by these three
  dayTimes: [{ startDate, time, endTime,     // startDate = the picked first date (required here)
               date?,                        // 1–31, set when repeatBy = 'date'
               day? }],                      // 0–6, set when repeatBy = 'weekday'
  rules: [{ occurrence, day }] }             // one entry when repeatBy = 'weekday'
```
- `frequency` enum extended in `group.model.js` (routine) and `meetup.model.js` (meetup).
- Exactly one `dayTimes` entry. The backend rejects 0 or >1 with a 400, and rejects a
  missing `startDate`.
- Interval months: quarterly 3, semiannual 6, yearly 12 (one shared constant).

## Date rules
- Occurrence *k* falls in month `startDate.month + k × interval`, at `time` in the group timezone.
- **Same date:** day = the picked day, clamped to the month's last day (31st → Apr 30;
  Feb 29 yearly → Feb 28 in non-leap years), same as Monthly.
- **Same weekday:** "Nth weekday" of that month. *(my call)* The occurrence is derived
  from the picked date: days 1–28 give 1st–4th, days 29–31 give "Last". So Thanksgiving
  (always 22–28) reads "4th Thursday", and Jan 31 reads "Last Saturday". A 5th weekday
  is never offered, because most months don't have one and the meetup would silently skip.
- The first occurrence is the picked date itself. The calendar won't allow a date before today.
- In weekday mode, the picked date always matches its own rule, so occurrence 0 equals the picked date.

## Backend changes
- `utils/date.utils.js`: new `INTERVAL_MONTHS` map and
  `nextLongIntervalDate(dtEntry, routine, timezone, after)`, which steps whole intervals
  from `startDate` (with no 24-month loop limit). Callers in `meetupGeneration.js`
  (`computeScheduleCandidates`), `computeNextGenerationAt` and `scripts/backfill.js`
  branch to it for the three frequencies.
- **How far ahead meetups are created** (`getGenerationWindowDays`): quarterly 730 (8),
  semiannual 1095 (6), yearly 1095 (3). *(my call)*
- **RSVP reminder stages** (`RSVP_REMINDER_STAGES`): quarterly = monthly's stages
  (14d, 7d, 3d, 24h, 6h); semiannual and yearly add a 30d stage first. Copy in
  `job.controller.js` reuses the monthly copy plus a new `30d` line ("…is a month out…").
  *(my call)*
- **Change summary** (`changeSummary.js`): "Every 3 months on the 15th at 6:00 PM",
  "Every 6 months on the 3rd Thursday at…", "Yearly on March 15 at…",
  "Yearly on the 4th Thursday of November at…".
- **Old-app guard** *(my call)*: in `updateSchedule` and the legacy single-schedule update
  path, when `isLegacyClient(req)` and the stored schedule has a quarterly/semiannual/yearly
  routine, keep the stored routines and apply the other fields. The response is unchanged,
  so the old app shows no error.
- Validation helper `validateLongIntervalRoutines(routines)`, next to `validateRoutineEndTimes`.

## App changes
- `utils/api.ts`: `Frequency` and meetup `frequency` unions, `repeatBy` on the routine type.
- Labels: `FREQ_LABELS` / `FREQUENCY_LABELS` → "Quarterly", "Semi-annually", "Yearly".
  `buildFrequencyDetail` shows "15th day" / "3rd Th" / "Mar 15".
- `utils/schedule.ts` (schedule text) and `GroupDetailsView` use the same wording as the
  change summary.
- **Schedule screens** (create and edit, including the Multiple Rules builder):
  - Picking one of the three opens a "First date" calendar field plus a time (and end time) row.
  - Below that come two radio cards styled like Monthly's: "Same date — the 15th" and
    "Same weekday — the 3rd Thursday", worked out live from the picked date.
  - Continue stays disabled until a date and a mode are chosen.
- Drafts: `createGroupDraft.ts`, `editScheduleDraft.ts` (incl. inferring the draft back
  from stored routines) and `scheduleRoutines.ts` (draft → routine). Each gets
  `longFirstDate`, `longRepeatBy`, `longTime`, `longEndTime`.
- `ReviewScreen` lists the series in the same wording.
- **Home tab caps** (`TAB_CAP_DAYS`): quarterly 100, semiannual 200, yearly 380, so the
  next meetup of each series is always visible. *(my call)*

## Old app (1.3.x) behaviour
- Shows the raw value in Group Details ("Quarterly", "Semiannual", "Yearly") and no
  frequency label on meetup details. Acceptable.
- Saving the schedule from the old edit screen keeps the stored routines (guard above).
- New app + old backend: the old backend's enum rejects the new values with a 400. Ship the
  backend first (it is additive and safe for old apps).

## Tests
- Backend (`date.utils.test.mjs`, `meetupGeneration`, `changeSummary.test.mjs`, validation):
  - Quarterly from Jan 31 gives Apr 30, Jul 31, Oct 31.
  - Yearly from Feb 29 2028 gives Feb 28 2029.
  - Semiannual "Last Saturday" from Jan 31 2026 gives Jul 25 2026.
  - Yearly 4th Thursday from Nov 26 2026 gives Nov 25 2027.
  - Window counts are 8, 6 and 3.
  - The old-app guard keeps routines.
  - A routine without a startDate gets a 400.
- Mobile (jest): draft ↔ routine round trip for each mode, weekday derivation (days 28 vs
  29), labels.

## Left to the builder
- Exact copy for the 30-day reminder.
- Exact styling of the first-date field (reuse `CalendarPickerModal`).
