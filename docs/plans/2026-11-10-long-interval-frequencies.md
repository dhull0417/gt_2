# Quarterly / Semi-annually / Yearly frequencies — implementation plan

**Goal:** Add `quarterly`, `semiannual` and `yearly` recurring frequencies, anchored on a picked first date and repeating by same date or same weekday.

**Architecture:** The backend gains one date function, `nextLongIntervalDate`, which steps whole 3/6/12-month intervals from `dayTimes[0].startDate`. Generation, next-trigger and backfill branch to it for the three new values; everything else keyed on frequency (windows, reminders, labels, Home caps) gets new entries. In the app, a shared `utils/longInterval.ts` owns weekday derivation, draft ↔ routine conversion and wording, so both schedule screens, the drafts and the labels call the same code.

**Tech stack:** Node/Express/Mongoose + Luxon (backend, `node --test`), Expo/React Native + TypeScript + Luxon (mobile, jest).

**Spec:** `docs/specs/2026-11-10-long-interval-frequencies-design.md`

## Global constraints
- Frequency values are exactly `'quarterly' | 'semiannual' | 'yearly'`. Interval months: `{ quarterly: 3, semiannual: 6, yearly: 12 }`.
- `repeatBy` is exactly `'date' | 'weekday'`.
- Generation windows (days): quarterly 730, semiannual 1095, yearly 1095.
- Home caps (days): quarterly 100, semiannual 200, yearly 380.
- Reminder stages: quarterly = monthly's stages. Semiannual and yearly = `[{key:'30d',offsetHours:720}, ...monthly stages]`.
- Weekday derivation from the picked day-of-month: 1–7 gives 1st, 8–14 gives 2nd, 15–21 gives 3rd, 22–28 gives 4th, 29–31 gives Last.
- Labels: "Quarterly", "Semi-annually", "Yearly".
- Do not change the behaviour of any existing frequency. Files use CRLF line endings, so keep them.
- After every task: backend `npm test` in `backend/`, mobile `npx tsc --noEmit` and `npx jest` in `mobile/`.

## Review focus
1. Month-end clamping across intervals: quarterly from Jan 31 must give Apr 30, then **Jul 31** (not Jul 30). Always compute from the anchor, never from the previous occurrence. Test in Task 1.
2. A picked first date earlier today, at a time already past: occurrence 0 is skipped by the existing `kickoffDate`/window logic, not generated in the past. Test in Task 2.
3. Old-app save of a schedule holding a mix of a monthly and a yearly routine (Multiple Rules): every stored routine is kept. Test in Task 4.
4. Editing an existing quarterly schedule in the new app round-trips without changing its first date or mode. Test in Task 6.
5. A weekday rule picked on the 29th–31st ("Last") in a month where that weekday falls on the 24th–28th still lands on the last one. Test in Task 1.

## File map
| File | Change |
|---|---|
| `backend/src/utils/date.utils.js` | `INTERVAL_MONTHS`, `LONG_INTERVAL_FREQUENCIES`, `nextLongIntervalDate`, windows, reminder stages, `computeNextGenerationAt` branch |
| `backend/src/utils/meetupGeneration.js` | branch in `computeScheduleCandidates` |
| `backend/src/scripts/backfill.js` | same branch |
| `backend/src/models/group.model.js`, `meetup.model.js` | enum + `repeatBy` |
| `backend/src/utils/longIntervalValidation.js` (new) | `validateLongIntervalRoutines`, `keepLongIntervalRoutinesForLegacy` |
| `backend/src/controllers/group.controller.js` | call validation + legacy guard in `createGroup`, `createSchedule`, `updateSchedule`, `updateGroupSchedule` |
| `backend/src/controllers/job.controller.js` | reminder copy |
| `backend/src/utils/changeSummary.js` | routine wording |
| `mobile/utils/api.ts` | types |
| `mobile/utils/longInterval.ts` (new) | derivation, draft ↔ routine, wording |
| `mobile/utils/scheduleConstants.ts`, `meetupFrequency.ts`, `schedule.ts` | labels/wording |
| `mobile/utils/scheduleRoutines.ts`, `createGroupDraft.ts`, `editScheduleDraft.ts` | draft fields, payload, validity, inference |
| `mobile/components/create-group/LongIntervalOptions.tsx` (new) | shared first-date + mode UI |
| `mobile/components/create-group/ScheduleScreen.tsx`, `ReviewScreen.tsx`, `app/group-edit-schedule/[id].tsx`, `components/GroupDetailsView.tsx`, `app/(tabs)/index.tsx` | wire-up |

---

## Task 1 — Backend date math
**Files:** modify `backend/src/utils/date.utils.js`; test `backend/src/utils/date.utils.test.mjs`.
**Produces:**
- `INTERVAL_MONTHS`
- `LONG_INTERVAL_FREQUENCIES: string[]`
- `nextLongIntervalDate(routine, dtEntry, timezone, after: Date|null): Date`. Returns the first occurrence strictly after `after`; with `null`, returns occurrence 0.
- `deriveWeekdayRule(dateTime: DateTime): { occurrence, day }`

- [x] Write failing tests in a `describe('nextLongIntervalDate')` block (times "06:00 PM", tz `America/Denver`). Each step feeds the previous result back in as `after`:
  - Quarterly by date from 2026-01-31 → Jan 31, Apr 30, Jul 31, Oct 31.
  - Yearly by date from 2028-02-29 → Feb 29 2028, Feb 28 2029.
  - Semiannual weekday "Last" Saturday from 2026-01-31 → Jan 31, Jul 25 2026.
  - Yearly weekday "4th" Thursday from 2026-11-26 → Nov 26 2026, Nov 25 2027.
  - "Last" Friday from 2026-10-30, yearly → Oct 29 2027.
  - `deriveWeekdayRule`: day 28 → 4th; day 29 → Last.
- [x] Run `npm test` → expect FAIL: `nextLongIntervalDate is not a function`.
- [x] Implement. `k` starts at 0 and increments. Each candidate month = anchor month start + `k × interval` months. Date mode: clamp the day to `daysInMonth`. Weekday mode: use the existing ordinal day-finding logic (extract it into a local helper `nthWeekdayOfMonth(monthStart, occurrence, day)` and reuse it in the `ordinal` branch, which must not change its behaviour). Set the time and return the first candidate `> after`. Loop limit: 1,000.
- [x] Add the windows (730/1095/1095) and `RSVP_REMINDER_STAGES` entries. Branch `computeNextGenerationAt` to `nextLongIntervalDate` when `LONG_INTERVAL_FREQUENCIES.includes(routine.frequency)`. Add a test for each.
- [x] Run → PASS (full suite). Commit "Backend date math for quarterly/semiannual/yearly".

## Task 2 — Generation + models + backfill
**Files:** modify `meetupGeneration.js`, `scripts/backfill.js`, `models/group.model.js`, `models/meetup.model.js`; test `meetupGeneration.test.mjs`.
**Consumes:** Task 1.
- [x] Failing tests on `computeScheduleCandidates`, using the group/schedule fixtures already in that file:
  - Quarterly from today+10 days → 8 candidates, each with `frequency: 'quarterly'`.
  - Yearly → 3.
  - Semiannual → 6.
  - A yearly routine whose startDate is today at an earlier time → its first candidate is next year.
- [x] Run → FAIL (wrong count).
- [x] In the dtEntry loop, when the frequency is long-interval, call `nextLongIntervalDate(routine, dtEntry, timezone, currentAnchor)` instead of `calculateNextMeetupDate`. Same branch in `backfill.js`. Add the values to both enums, plus `repeatBy: { type: String, enum: ['date','weekday'] }` on the routine.
- [x] Run → PASS. Commit.

## Task 3 — Validation
**Files:** create `backend/src/utils/longIntervalValidation.js` + `.test.mjs`; modify `group.controller.js` (`createGroup`, `createSchedule`, `updateSchedule`, `updateGroupSchedule`, next to each `validateRoutineEndTimes` call).
**Produces:** `validateLongIntervalRoutines(routines): string | null`.
- [x] Failing tests; error strings:
  - Two dayTimes → `"Quarterly, semi-annual and yearly schedules take one date."`
  - Missing startDate → `"Pick a first date."`
  - `repeatBy` missing or invalid → `"Choose same date or same weekday."`
  - Weekday mode without `rules[0]` → same message as above.
  - A valid routine and existing frequencies → null.
- [x] Run → FAIL. Implement and wire up (400 `{ error }`). Run → PASS. Commit.

## Task 4 — Old-app guard
**Files:** same new module + controller (`updateSchedule`, `updateGroupSchedule`).
**Produces:** `keepLongIntervalRoutinesForLegacy(incoming, existing): routines`. Returns `existing` when any existing routine is long-interval, otherwise `incoming`.
- [x] Failing tests:
  - Existing `[monthly, yearly]` + incoming `[monthly]` → existing.
  - Existing `[monthly]` → incoming.
  - Existing undefined → incoming.
- [x] Run → FAIL. Implement. In the controller, inside the `isLegacyClient(req)` branch, apply it before `preserveLegacyEndTimes`. Run → PASS. Commit.

## Task 5 — Reminder copy + change summary
**Files:** `job.controller.js`, `changeSummary.js`; test `changeSummary.test.mjs`.
- [x] Failing `scheduleChanges` tests for the wording:
  - "Every 3 months on the 15th at 6:00 PM"
  - "Every 6 months on the 3rd Thursday at 6:00 PM"
  - "Yearly on March 15 at 6:00 PM"
  - "Yearly on the 4th Thursday of November at 6:00 PM"
  
  The month comes from `dayTimes[0].startDate` in UTC (stored as a date-only value).
- [x] Run → FAIL. Implement in `routineLines`. Add `RSVP_REMINDER_COPY` entries: quarterly = `MONTHLY_REMINDER_COPY`; semiannual and yearly = `{ '30d': (name) => \`"${name}" is a month away — RSVP whenever you know.\`, ...MONTHLY_REMINDER_COPY }`. Run → PASS. Commit.

## Task 6 — App shared helpers
**Files:** modify `mobile/utils/api.ts`; create `mobile/utils/longInterval.ts` + `__tests__/longInterval.test.ts`.
**Produces:**
- `LongFrequency`, `LONG_FREQUENCIES`
- `deriveWeekdayRule(iso: string): { occurrence: string; day: number }`
- `LongDraft = { longFirstDate: string|null; longRepeatBy: 'date'|'weekday'|null; longTime: string; longEndTime: string|null }`
- `buildLongRoutine(freq, d: LongDraft)`
- `longDraftFromRoutine(r: Routine): LongDraft`
- `describeLongRoutine(r: Routine): string` (same wording as Task 5)
- `isLongDraftValid(d): boolean`
- [x] Failing tests:
  - Derivation on days 28 and 29.
  - Build → parse round trip for both modes keeps the first date, mode, time and end time.
  - Both wordings.
  - Validity: false without a date or a mode.
- [x] Run `npx jest longInterval` → FAIL (module not found). Implement. Add the frequency values to the `Frequency` and meetup unions, and `repeatBy?` to `Routine`. Run → PASS, `tsc` clean. Commit.

## Task 7 — Labels and wording across the app
**Files:** `scheduleConstants.ts` (`FREQ_LABELS`), `meetupFrequency.ts` (`FREQUENCY_LABELS`, `buildFrequencyDetail`), `schedule.ts` (`formatSingleRoutine` → `describeLongRoutine`), `GroupDetailsView.tsx` (frequency heading via `FREQ_LABELS`), `app/(tabs)/index.tsx` (`TAB_CAP_DAYS`).
- [x] Failing tests in `meetupFrequency.test.ts`: `buildFrequencyDetail` gives "Mar 15" for a yearly meetup on Mar 15, "15th day" for quarterly by date, and "3rd Th" when that meetup's date is the 3rd Thursday. Add a `schedule.test.ts` case for `formatSchedule`.
- [x] Run → FAIL. Implement. Run → PASS. Commit.

## Task 8 — Drafts and payloads
**Files:** `scheduleRoutines.ts` (`RoutineDraft` + `buildRoutines`), `createGroupDraft.ts` (`ScheduleData`, `defaultSchedule`, `isScheduleTabValid`), `editScheduleDraft.ts` (`ScheduleData`, `defaultSchedule`, `apiRoutineToBuiltRoutine`, `scheduleFromNamedSchedule`, `buildLabel`); test `scheduleDrafts.test.ts`.
**Consumes:** Task 6. Both `ScheduleData` types gain `LongDraft` fields, defaulting to `null / null / "05:00 PM" / null`.
- [x] Failing tests:
  - The create-group payload for a quarterly draft equals `buildLongRoutine` output.
  - `isScheduleTabValid` is false until a date and a mode are set.
  - `scheduleFromNamedSchedule` on a stored yearly weekday schedule restores the `LongDraft`.
  - Multiple Rules: `apiRoutineToBuiltRoutine` on a semiannual routine keeps it, and its label uses `describeLongRoutine`.
- [x] Run → FAIL. Implement. Run → PASS. Commit.

## Task 9 — Schedule UI
**Files:**
- Create `components/create-group/LongIntervalOptions.tsx`. Props: `value: LongDraft`, `onChange(patch)`, `colors`. It shows:
  - A first-date field that opens the existing `CalendarPickerModal`, with min date today.
  - Time and end-time rows, reusing the existing time picker pattern from the monthly section.
  - Two radio cards styled like Monthly's: "Same date" with "the 15th" or "Mar 15", and "Same weekday" with "the 3rd Thursday". They are disabled until a date is picked.
- Modify `ScheduleScreen.tsx`:
  - Add the three options to the picker list.
  - Render `LongIntervalOptions` for them.
  - Add them to the custom-builder frequency list and its save path.
- Modify `app/group-edit-schedule/[id].tsx` the same way.
- Modify `ReviewScreen.tsx` to show the wording from `describeLongRoutine`.

No new unit tests; the logic is covered by Tasks 6–8.
- [x] `tsc` clean and full jest passes. Commit.
- [x] Device checklist (append to this plan when done):
  - Create one of each frequency in both modes; Home shows the next meetup; meetup details label is correct.
  - Edit a schedule and change its first date: RSVPs on unaffected dates are kept.
  - Multiple Rules mixing monthly + yearly.
  - Dark mode.
  - Android back button on the calendar modal.
  - From a 1.3.x build, save the schedule: the routines are unchanged.

## Ship order
Backend first (Tasks 1–5 are additive; old apps are unaffected), then the app build.

---

## Status (2026-11-10)
Tasks 1–9 built (uncommitted). Backend: 193 tests pass across every test file. Mobile: `tsc` clean, jest 172/172.

Changes from the plan:
- `scripts/backfill.js` needed no change: it only calls `computeNextGenerationAt`, which already handles the new frequencies.
- Meetup-details label (`buildFrequencyDetail`) shows the plain date ("Mar 15") for all three. A meetup doesn't record whether its series repeats by date or by weekday, so "3rd Th" could be wrong.
- Multiple Rules entries now carry `repeatBy` (`BuiltRoutine.repeatBy`, `buildRoutines`). Without it the mode was lost on save.
- The schedule-level "Start date" field is hidden for these frequencies, and the payload sends the first date as `startDate`.
- `CalendarPickerModal` takes an optional `title`.
- Commits were not made per task (left for review).
- `npm test` in `backend/` runs every test but doesn't exit by itself in this environment. Run single files with `node --test --test-force-exit` if it hangs.

Device checklist (not yet run): see Task 9.
