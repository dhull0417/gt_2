# Schedule End Date — Implementation Plan

**Goal:** Recurring schedules get an optional, inclusive end date after which no meetups are generated; organizers choose whether already-generated meetups past it are deleted or kept.

**Architecture:** `schedule.endDate` (date-only UTC midnight, like `startDate`) bounds the candidate walk in `computeScheduleCandidates`; a schedule with nothing left to generate gets `nextGenerationAt = null`. Reconcile's stale-meetup choice moves into a pure helper that protects post-end meetups unless `removeAfterEnd` is passed. Mobile adds an "Ending (optional)" picker to `RecurrenceEditor` and a Delete/Keep prompt on the edit-schedule save, fed by a new count endpoint.

**Tech stack:** Node/Express + Mongoose + Luxon (backend, `node --test`), Expo React Native + TypeScript (mobile, Jest).

**Spec:** `docs/specs/2026-11-20-schedule-end-date-design.md`

## Global constraints
- `endDate`: stored as date-only UTC midnight; `null` = no end. Interpreted in the group timezone via `DateTime.fromJSDate(d, { zone: 'utc' }).setZone(tz, { keepLocalTime: true })`.
- Inclusive: end boundary = `.endOf('day')` of the end date in the group timezone.
- `endDate === undefined` in a request never changes the stored value; `removeAfterEnd` defaults to `false`.
- Validation message (server + client): `"End date can't be before the start date."`
- Picker: label `"Ending (optional)"`, placeholder `"No end date"`, clear link `"No end date"`, max = today + 2 years.
- Summary suffix: `" · until Mar 15"` (`LLL d`; add `, yyyy` when not the current year). Review/details: `"Ends Mar 15, 2027"` (`DATE_MED`).
- Prompt (no counts shown): title `"Delete meetups after Mar 15?"`, body `"Some meetups are already on the calendar after this date. Delete them, or keep them?"`, buttons `Cancel` / `Keep` / `Delete` (destructive). The count is only used to decide whether to ask.
- Change-notification line: label `"Ends"`, value `"Mar 15, 2027"` or `"No end date"`.

## Review focus
1. A 11:00 PM Denver slot on the end date (already the next day in UTC) is generated — test in Task 1.
2. Biweekly (per-row `startDate` phase anchor) and yearly (long-interval path) both stop at the end date — tests in Task 1.
3. An old app build PATCHing without `endDate` keeps it and never deletes post-end meetups — test in Task 5.
4. A finished schedule writes `nextGenerationAt: null` and the group still saves (the `touched` check sees the change) — test in Task 2.
5. Hand-edited (override) meetups after the end date survive `removeAfterEnd: true` — test in Task 3.

## File map
| File | Responsibility |
|---|---|
| `backend/src/utils/scheduleEndDate.js` (new) | `scheduleEndBoundary`, `endDateProblem` |
| `backend/src/models/group.model.js` | `endDate` field |
| `backend/src/utils/meetupGeneration.js` | cut-off, `finished`, `pickStaleMeetupIds`, `removeAfterEnd` |
| `backend/src/controllers/group.controller.js` | accept/validate `endDate`, pass `removeAfterEnd`, `countMeetupsAfter` |
| `backend/src/routes/group.route.js` | `GET /:groupId/schedules/:scheduleId/meetups-after` |
| `backend/src/utils/changeSummary.js` | "Ends" change line |
| `mobile/utils/api.ts` | types + `countMeetupsAfter` |
| `mobile/utils/createGroupDraft.ts`, `editScheduleDraft.ts`, `scheduleRoutines.ts` | `endDate` in drafts/payloads |
| `mobile/utils/formIssues.ts`, `formSummaries.ts` | validation, summary |
| `mobile/components/ui/form/fields.tsx` | `DateField.onClear` |
| `mobile/components/schedule/RecurrenceEditor.tsx` | Ending picker |
| `mobile/components/create-group/ReviewScreen.tsx`, `ScheduleDetailsModal.tsx` | "Ends …" display |
| `mobile/app/group-edit-schedule/[id].tsx` | save prompt |

---

## Task 1 — End boundary + generation cut-off
**Files:** create `backend/src/utils/scheduleEndDate.js`, `backend/src/utils/scheduleEndDate.test.mjs`; modify `group.model.js`, `meetupGeneration.js`; test `meetupGeneration.test.mjs`.
**Produces:** `scheduleEndBoundary(schedule, timezone): DateTime | null`.
- [x] Tests (`scheduleEndDate.test.mjs`): null endDate → `null`; `2027-03-15` in America/Denver → `2027-03-15T23:59:59.999-06:00`.
- [x] Tests (`meetupGeneration.test.mjs`): weekly Sunday 6 PM with endDate = the 4th upcoming Sunday → exactly 4 candidates, last one on the end date; weekly Sunday 11 PM, same end → last candidate is on the end date (Denver); biweekly with row `startDate` → no candidate after end; yearly → no candidate after end; endDate null → unchanged count (50–54).
- [x] Run `npm test` in backend → new tests FAIL (`scheduleEndDate.js` missing / too many candidates).
- [x] Add `endDate: { type: Date, default: null }` to `namedScheduleSchema`; implement `scheduleEndBoundary`; in `computeScheduleCandidates`, compute it once and in the walk treat `nextMeetupDT > endBoundary` like passing the window (stop this dayTime). Also return `endBoundary`.
- [x] Run → PASS. Commit "Stop generating schedule meetups after the end date".

## Task 2 — Finished schedules stop the regen job
**Files:** modify `meetupGeneration.js`; test `meetupGeneration.test.mjs`.
**Produces:** `computeScheduleCandidates` returns `finished: boolean` (true when every dayTime's next occurrence is past `endBoundary`; `earliestNextTrigger` then `null`).
- [x] Tests: endDate yesterday → `candidates: []`, `finished: true`, `earliestNextTrigger: null`; endDate 3 weeks out → `finished: false`, trigger set. `generateMeetupsForGroup` on a finished schedule (Meetup mocked with `mock.module`, group with `save` spy) sets `nextGenerationAt` to `null` and calls `save` once.
- [x] Run → FAIL.
- [x] Implement: skip `computeNextGenerationAt` for a dayTime whose walk ended on the boundary; in `generateMeetupsForSchedule`, `if (finished) schedule.nextGenerationAt = null; else if (earliestNextTrigger) …`.
- [x] Run → PASS. Commit.

## Task 3 — Reconcile protects post-end meetups
**Files:** modify `meetupGeneration.js`; test `meetupGeneration.test.mjs`.
**Produces:** `pickStaleMeetupIds(upcoming, wantedKeys: Set<string>, { resetAll, endBoundary, removeAfterEnd }): ObjectId[]`; `reconcileScheduleMeetups(group, schedule, { resetAll, removeAfterEnd = false })`.
- [x] Tests: meetup after end, not wanted, `removeAfterEnd: false` → kept; same with `true` → stale; meetup before end and not wanted → stale (unchanged behavior); `resetAll` → all stale; no end date → today's behavior. (Override meetups never reach the helper — reconcile queries `isOverride: false` — assert that query filter stays in a reconcile test with Meetup mocked.)
- [x] Run → FAIL.
- [x] Implement the helper; reconcile uses it with `scheduleEndBoundary(schedule, group.timezone)`.
- [x] Run → PASS. Commit.

## Task 4 — Validation helper
**Files:** `scheduleEndDate.js`; test `scheduleEndDate.test.mjs`.
**Produces:** `endDateProblem({ endDate, startDate, routines }): string | null`.
- [x] Tests: null → null; end = start → null; end before `startDate` → the exact message; biweekly/yearly with no `startDate` but row `startDate` later than end → message.
- [x] FAIL → implement (earliest of `startDate` and every `routines[].dayTimes[].startDate`, compared as ISO dates) → PASS. Commit.

## Task 5 — Controllers accept `endDate` / `removeAfterEnd`
**Files:** modify `group.controller.js`; create `backend/src/controllers/scheduleEndDate.handlers.test.mjs` (pattern: `meetupSettings.handlers.test.mjs`).
**Consumes:** `endDateProblem`, `reconcileScheduleMeetups(..., { removeAfterEnd })`.
- [x] Tests: `createSchedule` stores `endDate`; `updateSchedule` with end before start → 400 + message; with `endDate: null` → cleared; without `endDate` (legacy) → stored value kept and reconcile called with `removeAfterEnd: false`; with `removeAfterEnd: true` → reconcile receives `true`. `createGroup` stores `endDate` on the primary schedule (line ~82).
- [x] FAIL → implement (destructure `endDate`, `removeAfterEnd`; validate against post-update values; `if (endDate !== undefined) target.endDate = endDate || null`) → PASS. Commit.

## Task 6 — Count endpoint
**Files:** `group.controller.js` (`countMeetupsAfter`), `group.route.js`; test in `scheduleEndDate.handlers.test.mjs`.
**Produces:** `GET /api/groups/:groupId/schedules/:scheduleId/meetups-after?date=YYYY-MM-DD` → `{ count: number }`.
- [x] Tests: counts only `isOverride: false`, `status: 'scheduled'` meetups of that schedule with `date >` end of that day in the group timezone (assert the `Meetup.countDocuments` filter); non-manager → 403; bad/missing `date` → 400.
- [x] FAIL → implement + route → PASS. Commit.

## Task 7 — Change notification line
**Files:** `changeSummary.js`; test `changeSummary.test.mjs`.
- [x] Tests: `scheduleSnapshot` includes `endDate`; added → `{ label: 'Ends', value: 'Mar 15, 2027' }`; cleared → `'No end date'`; unchanged → no line. Ordered right after `When`.
- [x] FAIL → implement → PASS. Commit.

## Task 8 — Mobile drafts, types, payloads
**Files:** `api.ts`, `createGroupDraft.ts`, `editScheduleDraft.ts`, `scheduleRoutines.ts`; test `utils/__tests__/scheduleDrafts.test.ts`.
**Produces:** `ScheduleData.endDate: string | null` (both interfaces); `Schedule.endDate?: string | null`; `ScheduleInput.endDate?: string | null; removeAfterEnd?: boolean`; payloads always send `endDate`.
- [x] Tests: new drafts start with `endDate: null`; edit draft loads `sched.endDate` as ISO date; payload carries `endDate` (and `null` when cleared).
- [x] FAIL → implement → PASS (`npx jest` in mobile, then `npx tsc --noEmit`). Commit.

## Task 9 — Client validation
**Files:** `formIssues.ts`; test `formIssues.test.ts`.
- [x] Tests: `scheduleIssues` adds `{ area: 'when', field: 'endDate', kind: 'invalid', message: <exact> }` when end < start (or < earliest row first date); nothing when null.
- [x] FAIL → implement → PASS. Commit.

## Task 10 — Summaries and display
**Files:** `formSummaries.ts`, `ReviewScreen.tsx`, `ScheduleDetailsModal.tsx`; test `formSummaries.test.ts`.
- [x] Tests: weekly + endDate this year → `"Weekly · Sun · 6:00 PM · until Mar 15"`; next year → `"… · until Mar 15, 2027"`; null → no suffix.
- [x] FAIL → implement `recurrenceSummary` suffix; add "Ends …" text to ReviewScreen (next to "Starts") and ScheduleDetailsModal → PASS. Commit.

## Task 11 — Ending picker
**Files:** `components/ui/form/fields.tsx`, `RecurrenceEditor.tsx`; test `components/schedule/__tests__/RecurrenceEditor.test.tsx`.
**Produces:** `DateField` prop `onClear?: () => void` (renders "No end date" link only when `value` is set).
- [x] Tests: "Ending (optional)" renders for weekly, biweekly and yearly; picking a date calls `update` with `endDate`; tapping "No end date" sets `endDate: null`; field error shows `fieldIssue(issues, 'endDate')`.
- [x] FAIL → implement (min = `d.startDate ?? today`, max = today + 2 years) → PASS. Commit.

## Task 12 — Save prompt
**Files:** `api.ts` (`groupApi.countMeetupsAfter(api, groupId, scheduleId, date): Promise<number>`), `app/group-edit-schedule/[id].tsx`; test `components/__tests__/EditScheduleScreen.test.tsx`.
- [x] Tests (Alert + api mocked): end date unchanged → no count call, no alert; changed and count 0 → saves with `removeAfterEnd: false`, no alert; count 3 → alert with exact title/body (body contains no number); Delete → `removeAfterEnd: true`; Keep → `false`; Cancel → no save; count call throws → saves with `false`; new schedule → no count call.
- [x] FAIL → implement in `handleSave` (Alert wrapped in a Promise) → PASS. Commit.

## Task 13 — Verify
- [x] Full backend `npm test`, mobile `npx jest` and `npx tsc --noEmit` green.
- [x] Reread spec line by line against the diff; fresh-reviewer subagent checks the whole change against the spec.

---

## Execution notes (2026-11-20)
- All tasks done test-first. Backend 607/607, mobile see final run below.
- Task 12: the Delete/Keep decision lives in `mobile/utils/endDatePrompt.ts` (`decideRemoveAfterEnd`, `askDeleteAfterEnd`) so it's testable without the screen; the screen wires it in `handleSave`. Prompt copy has no count (owner's call); the title adds the year when it isn't this year.
- Fresh review follow-ups, fixed: malformed `endDate` now 400s via `parseEndDate` (a timestamp keeps its calendar day); end-date picker minimum uses the series' real first day (`seriesStartDay`); "No end date" link has an accessibility label; a test-fixture type error.
- Decided: members who RSVP'd to meetups removed by Delete get only the schedule-wide "Ends" notice; no per-meetup cancellations (owner's call).
- Known, per spec: a save that also changes the group timezone resets every upcoming series meetup, so Keep can't preserve post-end meetups in that one case.
