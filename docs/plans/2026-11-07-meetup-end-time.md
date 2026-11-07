# Optional meetup end time — implementation plan

**Goal:** meetups and schedule rows can carry an optional end time that is shown as a range and replaces the 1-hour assumption.
**Architecture:** clock-time `endTime` ("08:00 PM") on group `dayTimes` and on meetups, plus a server-computed `endsAt` Date on meetups. One rule, implemented once per side (backend `utils/meetupEndTime.js`, mobile `utils/meetupTime.ts`): effective end = `endsAt ?? start + 1h`; an end clock time not after the start rolls to the next day.
**Tech stack:** Node/Express + Mongoose + Luxon (`node --test`), Expo/React Native + TypeScript (jest).
**Spec:** `docs/specs/2026-11-07-meetup-end-time-design.md`

## Global constraints
- Time strings are `"hh:mm AM/PM"` (what `dateToTimeString` produces; server also parses `"h:mm AM/PM"` via `parseTimeString`).
- `endTime` absent or `null` = no end time. Default fallback length: **60 minutes**.
- End equal to start → HTTP 400 `"End time can't be the same as the start time."`; client blocks the same case. Malformed end time → 400 `"Invalid end time."`
- Range text: `"5:00 PM – 8:00 PM"` (en dash with spaces, leading zero stripped, both meridiems always shown); no end → `"5:00 PM"`. No "+1 day" marker.
- Field label exactly **`End Time (Opt.)`**, empty value text **`None`**. Picker opens at start + 1 hour when empty.
- No push/email wording changes; 30-minute reminder unchanged.
- No new npm/native packages. Old (1.3.x) clients must keep working.
- Files use CRLF; edit in place (don't rewrite whole files).

## Review focus
1. **Legacy schedule save erasing end times** — 1.3.x sends rows without `endTime`. Test in Task 4: incoming row without the field copies the matching existing row's end time; a row whose start time changed does not.
2. **Series edit that only changes an end time** — slot key unchanged, so kept meetups must still get the new end. Test in Task 3.
3. **Rollover across DST / midnight** — 9 PM – 1 AM on Nov 1 2026 (Denver DST ends). Test in Task 1.
4. **Clearing an end time on one meetup** (`endTime: null`) must clear `endsAt`, and expiry must fall back to start + 1h. Tests in Tasks 5 and 6.
5. **Overrides keep their own end time on series edit.** Test in Task 3.

## File map
| File | Responsibility |
|---|---|
| `backend/src/utils/meetupEndTime.js` (new) + `.test.mjs` | all end-time rules: compute, validate, effective end, slot fields, reconcile ops, legacy preserve, expiry filter, meetup edit |
| `backend/src/models/group.model.js`, `meetup.model.js` | schema fields |
| `backend/src/utils/meetupGeneration.js` | copy end fields on generate; per-slot updates on reconcile |
| `backend/src/controllers/group.controller.js` | validate + legacy-preserve routines; one-off `endTime` |
| `backend/src/controllers/meetup.controller.js` | `updateMeetup` `endTime` |
| `backend/src/controllers/job.controller.js` | expiry uses effective end |
| `backend/src/controllers/calendar.controller.js` | ICS `DTEND` |
| `mobile/utils/api.ts` | types + payloads |
| `mobile/utils/timeString.ts`, `meetupTime.ts`, `meetupStatus.ts` | range formatting, end instant, status |
| `mobile/utils/scheduleRoutines.ts`, `createGroupDraft.ts`, `editScheduleDraft.ts` | draft fields, payload, load |
| `mobile/components/EndTimeField.tsx` (new) | the shared field |
| screens/components listed per task | wiring + display |

---

## Task 1 — Backend end-time rules
**Files:** create `backend/src/utils/meetupEndTime.js`, `backend/src/utils/meetupEndTime.test.mjs`.
**Produces:**
- `DEFAULT_DURATION_MS = 3600000`
- `validateEndTime(time, endTime) → string|null` (null when ok or endTime null/undefined; error strings from Global constraints; format regex `/^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/`)
- `computeEndsAt(startsAt: Date, endTime: string|null, timezone) → Date|null` (end clock on the start's day in `timezone`; if `<= startsAt`, `plus({ days: 1 })`)
- `effectiveEnd({ startsAt, endsAt }) → Date`

- [x] Write tests: `computeEndsAt(2026-10-06T23:00Z /*5 PM MDT*/, "08:00 PM", Denver)` → `2026-10-07T02:00Z`; `"09:00 PM"`→`"01:00 AM"` on Oct 6 → `2026-10-07T07:00Z`; Oct 31 9 PM MDT → `"01:00 AM"` → `2026-11-01T07:00Z` (1 AM MDT, before the fall-back); `null` → `null`. `validateEndTime("05:00 PM","05:00 PM")` → same-time error; `("05:00 PM","25:00 PM")` → `"Invalid end time."`; `("05:00 PM", null)` → null. `effectiveEnd` with/without `endsAt`.
- [x] `npm test` (backend) → FAIL: cannot find module `./meetupEndTime.js`.
- [x] Implement the three functions.
- [x] `npm test` → all pass. Commit "Add meetup end-time rules".

## Task 2 — Schemas + generation copies end time
**Files:** `models/group.model.js` (`dayTimeSchema.endTime: { type: String, default: null }`), `models/meetup.model.js` (`endTime: {String, null}`, `endsAt: {Date, null}`), `utils/meetupGeneration.js`, `utils/meetupEndTime.js` + test.
**Consumes:** Task 1. **Produces:** `slotEndFields(dtEntry, startsAt, timezone) → { endTime, endsAt }`.
- [x] Test: `slotEndFields({ time:"06:00 PM", endTime:"09:00 PM" }, <Sun 6 PM>, Denver)` → `endTime "09:00 PM"`, `endsAt` 3 h later; entry without `endTime` → `{ endTime: null, endsAt: null }`.
- [x] Run → FAIL (`slotEndFields` is not a function).
- [x] Implement; spread `...slotEndFields(dtEntry, nextDate, timezone)` into `docsToCreate.push({...})` in `generateMeetupsForSchedule`.
- [x] Run → pass. Commit.

## Task 3 — Reconcile updates end times per slot
**Files:** `utils/meetupEndTime.js` + test, `utils/meetupGeneration.js` (`reconcileScheduleMeetups`).
**Produces:** `buildEndTimeUpdates(upcoming, candidates, timezone) → mongoose bulkWrite ops[]`. `upcoming`: `{ _id, date, time, endTime, isOverride }[]`; candidates from `computeScheduleCandidates`. Match by `existenceKey(date, time)` (export it from `meetupGeneration.js` if not exported, or pass a key fn). Emit `updateOne { filter:{_id}, update:{ $set:{ endTime, endsAt } } }` only for non-override meetups whose `endTime` differs from the slot's.
- [x] Tests: end changed 9→10 PM on a kept slot → one op with new `endTime`/`endsAt`; unchanged → no op; override meetup with different end → no op; end removed → op sets `endTime:null, endsAt:null`.
- [x] Run → FAIL. Implement. In `reconcileScheduleMeetups`, select `'date time endTime isOverride'` and `if (ops.length) await Meetup.bulkWrite(ops)` for kept meetups.
- [x] Run → pass. Commit.

## Task 4 — Schedule validation + legacy preservation
**Files:** `utils/meetupEndTime.js` + test, `controllers/group.controller.js` (createGroup ~L228, add-schedule ~L494, `updateSchedule` ~L578).
**Produces:** `validateRoutineEndTimes(routines) → string|null` (first `validateEndTime` error across all `dayTimes`); `preserveLegacyEndTimes(incoming, existing) → routines` (for each incoming dayTime whose `endTime` key is **absent**, copy `endTime` from the existing routine with same `frequency` and a dayTime with same `day`, `date` and `time`).
- [x] Tests: equal-start row → error; legacy row same day/time → keeps `"09:00 PM"`; legacy row with start moved → no end; modern row with `endTime: null` → stays null (explicit clear).
- [x] Run → FAIL. Implement. In controllers: return 400 with the error before saving; in `updateSchedule` when `isLegacyClient(req) && routines !== undefined`, `routines = preserveLegacyEndTimes(routines, target.routines)`.
- [x] Run → pass. Commit.

## Task 5 — One-off create and single-meetup edit
**Files:** `utils/meetupEndTime.js` + test, `controllers/group.controller.js` (`createOneOffMeetup`), `controllers/meetup.controller.js` (`updateMeetup`).
**Produces:** `applyEndTimeEdit(meetup, bodyEndTime) → { error: string|null, changed: boolean }` — `undefined` = keep current `endTime`; `null`/`""` = clear; string = validate against `meetup.time`; always recomputes `meetup.endsAt = computeEndsAt(meetup.startsAt, meetup.endTime, meetup.timezone)`.
- [x] Tests: set → `endsAt` set, `changed:true`; `null` → both null, `changed:true`; `undefined` after start moved → `endsAt` follows new start, `changed:false`; equal → error.
- [x] Run → FAIL. Implement. `createOneOffMeetup`: read `endTime`, validate, store `endTime` + `endsAt`. `updateMeetup`: read `endTime`, call after `startsAt` is recomputed; 400 on error; add `changed` into `dateOrTimeChanged` (so the existing push fires).
- [x] Run → pass. Commit.

## Task 6 — Expiry job and ICS feed use the effective end
**Files:** `utils/meetupEndTime.js` + test, `controllers/job.controller.js` (`expirePastMeetups`), `controllers/calendar.controller.js`.
**Produces:** `expiryFilter(now) → { status:'scheduled', $or:[{ endsAt:{ $lte: now } }, { endsAt:null, startsAt:{ $lte: now − 1h } }] }`.
- [x] Test the filter object for a fixed `now`.
- [x] Run → FAIL. Implement; use it for both the `find` and `updateMany` in `expirePastMeetups`. ICS: `endDT = meetup.endsAt ? DateTime.fromJSDate(meetup.endsAt) : startDT.plus({ hours: 1 })`; make sure the feed query selects `endsAt`.
- [x] Full backend `npm test` → pass. Commit.

## Task 7 — Mobile types, range text, end instant, status
**Files:** `mobile/utils/api.ts` (`DayTime.endTime?: string|null`; `Meetup.endTime?: string|null; endsAt?: string|null`; `UpdateMeetupPayload.endTime?: string|null`; `CreateOneOffMeetupPayload.endTime?: string|null`), `utils/timeString.ts`, `utils/meetupTime.ts`, `utils/meetupStatus.ts`, tests `utils/__tests__/meetupEndTime.test.ts`.
**Produces:** `formatTimeRange(time, endTime?) → string`; `endTimeError(time, endTime?) → string|null` (same messages as server); `addHour(time) → string` (picker default); `meetupEndInstant(m) → Date` (`endsAt` else start + 1h). `getMeetupStatus` uses `meetupEndInstant` for `end`.
- [x] Tests: `formatTimeRange("05:00 PM","08:00 PM")` → `"5:00 PM – 8:00 PM"`; `("09:00 PM","01:00 AM")` → `"9:00 PM – 1:00 AM"`; no end → `"5:00 PM"`; `addHour("11:30 PM")` → `"12:30 AM"`; `getMeetupStatus` at start+2h with `endsAt` start+3h → happening; same with no `endsAt` → past.
- [x] `npm test` (mobile) → FAIL. Implement. → pass. `npx tsc --noEmit` clean. Commit.

## Task 8 — Mobile drafts carry end time
**Files:** `utils/scheduleRoutines.ts`, `utils/createGroupDraft.ts`, `utils/editScheduleDraft.ts`, `utils/__tests__/scheduleDrafts.test.ts`.
**Changes:** every `WeekdayRow`/`MonthlyDateEntry`/`OrdinalEntry` gets `endTime: string|null` and `showEndTimePicker: boolean`; `ScheduleData` gets `dailySharedEndTime: string|null`, `showDailySameEndTimePicker: boolean`; defaults `null`/`false`. `RoutineDraft` row types and `buildRoutines` add `endTime` to each dayTime **only when non-null**. `apiRoutineToBuiltRoutine`/`scheduleFromNamedSchedule` load `dt.endTime ?? null` (shared daily end from the first dayTime). `buildLabel` uses `formatTimeRange`. `isScheduleTabValid` returns false when any row has an `endTimeError`; expose `scheduleEndTimeError(d) → string|null` for the edit screen.
- [x] Tests: weekly row with end → payload dayTime `{ day, time, endTime }`; without → no `endTime` key; daily shared end applied to all 7 days; round-trip API routine → draft → payload keeps end; label shows range; equal end → tab invalid.
- [x] Run → FAIL. Implement. → pass, tsc clean. Commit.

## Task 9 — `EndTimeField` + create-group screens
**Files:** create `mobile/components/EndTimeField.tsx`; modify `components/create-group/ScheduleScreen.tsx`, `ReviewScreen.tsx`.
**Interface:** `<EndTimeField startTime endTime onChange(endTime|null) open onOpenChange(bool) asOverlay? />` — renders label `End Time (Opt.)`, value `formatTimeRange`-style time or `None`, ✕ (accessibilityLabel "Clear end time") when set, inline error text from `endTimeError`; mounts `NativeTimePicker` with `value={endTime ?? addHour(startTime)}` when `open`. Uses theme colors and the screen's existing `dateField` look (pass `style`).
- [x] Place under every start-time field: daily shared, daily rows, weekday rows, monthly dates, ordinal entries (and custom builder rows reuse these). Collapsed summaries (L152–158, L420, L470) and Review bullets use `formatTimeRange`.
- [x] tsc clean; existing tests pass. Manual (device): set/clear end on each row type, review shows range. Commit.

## Task 10 — Edit/add schedule screen
**Files:** `mobile/app/group-edit-schedule/[id].tsx`.
- [x] Same placements as Task 9; collapsed summaries use `formatTimeRange`; block save with `scheduleEndTimeError` (Alert with the message).
- [x] tsc clean. Manual: edit an existing schedule's end, save, reopen → value kept; existing meetups show new range. Commit.

## Task 11 — One-off wizard
**Files:** `mobile/components/AddMeetupWizard.tsx`, `mobile/utils/api.ts` (`createOneOffMeetup` sends `endTime`).
- [x] `EndTimeField` under the time field (`asOverlay` if the wizard is a Modal-hosted overlay like its time picker); reset with the form; send `endTime` (null when none); block Next/Create on `endTimeError`.
- [x] tsc clean. Manual: create one-off with and without end. Commit.

## Task 12 — Meetup sheet, card, group details
**Files:** `components/MeetupDetailModal.tsx`, `components/MeetupCard.tsx`, `components/GroupDetailsView.tsx`.
- [x] Header: date line (`toLocaleDateString` as now, without `• time`), then a time line `formatTimeRange(meetup.time, meetup.endTime)` in the same `headerTitle` style at a smaller size, then the existing location block.
- [x] Edit form: `newEndTime` state (seeded from `meetup.endTime ?? null`, reset with the others), `EndTimeField asOverlay` under the time field, include `endTime` in payload when changed, block save on `endTimeError`.
- [x] Add to Calendar: `endDate = meetupEndInstant(meetup)`.
- [x] Card (L144) and GroupDetailsView (L153, L179, L211) use `formatTimeRange`.
- [x] tsc clean, mobile tests pass. Manual: header three rows in light/dark; card range; long location still expands. Commit.

## Task 13 — Verify
- [x] Backend `npm test`, mobile `npm test` + `npx tsc --noEmit`.
- [x] Reread spec line by line; check each goal/decision against the diff.
- [ ] Fresh reviewer pass over the whole diff against the spec.
- [ ] Device checklist (for you): create group with an end time; edit only the end time on a series → cards update and RSVPs stay; 9 PM – 1 AM shows "Happening Now" at 11:30 PM; clear an end on one meetup; Add to Calendar length; old 1.3.x app saving that schedule keeps the end time.


## Execution notes (2026-11-07)
- **No commits** (your call): another session was editing the same working tree, so everything is left uncommitted for you to commit.
- **Meetup times use the viewer's timezone.** The parallel "tester feedback" work (#5) moved meetup times to the phone's zone (`formatMeetupTime`). So meetup displays use `formatMeetupTimeRange(m)` in `utils/meetupTime.ts`, which converts both ends and labels the zone once ("7:00 PM – 10:00 PM ET"). Schedule-row displays (editors, Review, Group Details schedule lines) use `formatTimeRange(time, endTime)` and keep the raw "05:00 PM – 08:00 PM" style those screens already show. That replaces the "leading zero stripped" constraint above.
- Draft row `endTime` / `showEndTimePicker` are optional fields (`?`) so existing row constructors didn't all need touching.
- Tests: backend 158/158 (`npm test`), mobile 145/145 (`jest`), `tsc --noEmit` clean. These were run from local copies, because running them in the OneDrive folder hangs.
