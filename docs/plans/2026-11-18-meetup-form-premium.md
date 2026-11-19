# Meetup form with Premium settings — implementation plan

**Goal:** Add Meetup and Edit Meetup share one full-screen form styled like Set Recurring Meetups, and every meetup (one-off or from a series) can carry its own RSVP rules, minimum, things to bring, rides and RSVP questions.

**Architecture:** Backend: a shared `utils/meetupSettings.js` validates per-meetup settings and computes the RSVP window; `createOneOffMeetup`, `updateMeetup` and a new `PUT /meetups/:id/questions` use it and set `Meetup.customSettings`; series refreshes skip customized meetups. Mobile: `RsvpRulesCard` and `CapacityCard` are extracted from `ScheduleScreen`; a new `MeetupForm` (state logic in `utils/meetupFormDraft.ts`) replaces the body of `AddMeetupWizard` and the inline edit modal in `MeetupDetailModal`.

**Tech stack:** Express + Mongoose, `node --test` (`npm test` in backend/); Expo / React Native, jest (`npx jest <path>` in mobile/), `npx tsc --noEmit`.

**Spec:** `docs/specs/2026-11-18-meetup-form-premium-design.md`

**Global constraints**
- RSVP rule defaults when "Limit RSVPs" is first turned on: earliest 1 day before at 09:00 AM, latest 0 days before at 09:00 AM (same as `defaultSchedule`).
- Day counts: integers 0–365. Times: "hh:mm AM/PM". Earliest must be ≥ latest (days, then time on the same day) — same rule as schedules.
- Minimum to Meet needs a latest RSVP time; 1 ≤ min ≤ capacity when capacity > 0 (`minHeadcountProblem`).
- Bring items: max 20, name ≤ 40 chars, max 1–99 or null (`parseBringItems`). Questions: max 5 (`parseQuestions`).
- Premium is checked with `groupHasPremium(group)`; responses reuse `MIN_HEADCOUNT_PREMIUM_REQUIRED`, `ASSIGNMENTS_PREMIUM_REQUIRED` and `{ error: "premium_required" }` for questions. Clearing a setting (0 / [] / false) never needs Premium.
- Ship backend before app. Fields the app doesn't send are unchanged.
- No git commits by the builder: the tree already holds uncommitted work (`MeetupDetailModal.tsx`, `meetup-detail/styles.ts`, ActionSheet). Changes are left for the owner to review and commit.

**Review focus**
1. Rescheduling a customized meetup recomputes its RSVP window from its own rules, not the series' → test in Task 3.
2. A series edit after a per-meetup edit leaves that meetup's items/claims/minimum/questions intact → tests in Task 4.
3. Editing items keeps claims on unchanged items (ids preserved) → test in Task 2.
4. A non-Premium group can still *clear* settings and edit date/location → test in Task 3.
5. Opening Edit on a meetup with RSVP rules = null (old series meetup with no window) shows "Allow anytime" and saving without touching RSVP Rules sends no RSVP fields (doesn't mark it customized) → test in Task 6.

## File map
| File | Status | Responsibility |
|---|---|---|
| `backend/src/models/meetup.model.js` | modify | new fields `rsvpLeadDays`, `rsvpLeadTime`, `rsvpDeadlineDays`, `rsvpDeadlineTime`, `customSettings` |
| `backend/src/utils/meetupSettings.js` | create | `parseBringItems`, `withExistingIds`, `minHeadcountProblem`, premium error bodies (moved from group.controller), `computeRsvpWindow`, `parseMeetupSettings` |
| `backend/src/utils/meetupSettings.test.mjs` | create | unit tests |
| `backend/src/controllers/group.controller.js` | modify | import moved helpers; `createOneOffMeetup` accepts settings |
| `backend/src/controllers/meetup.controller.js` | modify | `updateMeetup` accepts settings; new `updateMeetupQuestions` |
| `backend/src/routes/meetup.route.js` | modify | `PUT /:meetupId/questions` |
| `backend/src/utils/meetupGeneration.js`, `utils/rsvpQuestions.js` | modify | refreshes skip `customSettings` |
| `backend/src/controllers/meetupSettings.handlers.test.mjs` | create | handler tests (pattern: `rides.handlers.test.mjs`) |
| `mobile/utils/api.ts` | modify | `Meetup` + payload types, `meetupApi.updateMeetupQuestions` |
| `mobile/utils/meetupFormDraft.ts` (+ `__tests__/meetupFormDraft.test.ts`) | create | draft type, `draftFromMeetup`, `draftForNew`, `validateDraft`, `createPayload`, `updatePayload` |
| `mobile/components/schedule/RsvpRulesCard.tsx` | create | RSVP Rules card (from ScheduleScreen) |
| `mobile/components/schedule/CapacityCard.tsx` | create | Capacity card (from ScheduleScreen) |
| `mobile/components/create-group/ScheduleScreen.tsx`, `app/group-edit-schedule/[id].tsx` | modify | use the two cards |
| `mobile/components/meetup-form/MeetupForm.tsx` | create | the form |
| `mobile/components/AddMeetupWizard.tsx` | modify | wrapper around MeetupForm (same props) |
| `mobile/components/MeetupDetailModal.tsx` | modify | Edit opens MeetupForm; old edit modal removed |
| `mobile/app/group-questions/[id].tsx` | modify | accepts `meetupId` |

---

## Task 1 — Model fields + shared settings helpers
**Files:** `meetup.model.js`, create `utils/meetupSettings.js`, `utils/meetupSettings.test.mjs`; `group.controller.js` (imports only).
**Produces:** `computeRsvpWindow({ startsAt: Date, timezone: string, rules: { leadDays: number|null, leadTime: string, deadlineDays: number|null, deadlineTime: string } }) → { rsvpOpenDate: Date|null, rsvpCloseDate: Date|null }`; `parseRsvpRules(body) → { rules } | { error }` (reads `rsvpLeadDays/Time`, `rsvpDeadlineDays/Time`, `undefined` fields → `rules` omits them); plus moved `parseBringItems`, `withExistingIds`, `minHeadcountProblem`, `MIN_HEADCOUNT_PREMIUM_REQUIRED`, `ASSIGNMENTS_PREMIUM_REQUIRED`.
- [ ] Test `computeRsvpWindow`: meetup 2026-12-10 6:00 PM America/Denver, lead 2 @ "09:00 AM", deadline 0 @ "12:00 PM" → open 2026-12-08T16:00Z, close 2026-12-10T19:00Z; both days null → both null.
- [ ] Test `parseRsvpRules`: lead 0 < deadline 1 → error "The earliest time to RSVP must be before the latest."; same day with lead time after deadline time → same error; days 366 → error "Days must be from 0 to 365."; bad time "25:00" → error.
- [ ] Run `npm test` → new tests FAIL (module not found).
- [ ] Add model fields (`rsvpLeadDays`/`rsvpDeadlineDays`: Number, default null, min 0; times: String default "09:00 AM"; `customSettings`: Boolean default false). Create the module; move helpers out of `group.controller.js` and import them there unchanged.
- [ ] Run `npm test` → all PASS (existing group tests prove the move).

## Task 2 — `parseMeetupSettings`
**Consumes:** Task 1. **Produces:** `parseMeetupSettings(body, { meetup, group, capacity }) → Promise<{ patch, touched: boolean } | { status, body }>`. `patch` may hold `rsvpLeadDays, rsvpLeadTime, rsvpDeadlineDays, rsvpDeadlineTime, minAttendees, bringItems, ridesEnabled, bringClaims, rides`; `touched` = any settings field present in body. `meetup` is null when creating.
- [ ] Tests: items `[{_id: existingId, name:"Chips"}, {name:"Ice"}]` keep `existingId`, new one has no `_id`, and a claim on a removed item is dropped from `bringClaims`; `ridesEnabled:false` → `rides: []`; `minAttendees: 3` with no deadline → `{status:400}` (existing message); `minAttendees: 3` and Premium off → `{status:403, body: MIN_HEADCOUNT_PREMIUM_REQUIRED}`; items with Premium off → 403 ASSIGNMENTS; `minAttendees:0, bringItems:[], ridesEnabled:false` with Premium off → ok; empty body → `touched:false`, empty patch. Mock `premium.js` as `rides.handlers.test.mjs` does.
- [ ] Run → FAIL. Implement in `meetupSettings.js`. Deadline for the min check = patch's deadline if present, else `meetup.rsvpDeadlineDays`. Run → PASS.

## Task 3 — `createOneOffMeetup` and `updateMeetup`
**Consumes:** Tasks 1–2. **Files:** both controllers, create `controllers/meetupSettings.handlers.test.mjs`.
- [ ] Tests (through the handlers): create with lead 1 / deadline 0 + min 2 + items → saved meetup has `rsvpOpenDate`/`rsvpCloseDate` from `computeRsvpWindow`, `minAttendees 2`, items, `customSettings true`, `rsvpNotified` false when open date is future, `minimumChecked` false. Create with no settings → `customSettings false`, no window (unchanged behaviour). Update series meetup with `bringItems` → `customSettings true`. Update a customized meetup's date by +7 days → window moves +7 days from its own rules (series has different rules). Update a non-customized series meetup's date → window from series (existing behaviour). Premium off: update `location` only → 200; update `minAttendees: 0` → 200; `minAttendees: 2` → 403. Update latest RSVP time to the future on a meetup with `minimumChecked: true` → `minimumChecked` false.
- [ ] Run → FAIL. Implement: call `parseMeetupSettings`; on error return it; apply patch; `touched` → `customSettings = true`; when date/time changes or rules touched, compute window from the meetup's own rules if `customSettings || !schedule`, else the existing series path; for series meetups pass the meetup's base open into `resolveRsvpOpen` with the series schedule. Re-derive `rsvpNotified`/`minimumChecked` as in `refreshOverrideMeetupWindows`. Add `minAttendees` and RSVP times to the `before` snapshot so `changeSummary` reports them if it already formats those keys; otherwise leave notifications unchanged.
- [ ] Run → PASS; run full `npm test`.

## Task 4 — Series refreshes skip customized meetups; meetup questions endpoint
**Files:** `meetupGeneration.js`, `rsvpQuestions.js`, `meetup.controller.js`, `meetup.route.js`, handlers test.
**Produces:** `PUT /api/meetups/:meetupId/questions` body `{ questions }` → `{ meetup }`.
- [ ] Tests: `refreshOverrideAssignments`, `refreshOverrideMeetupWindows`, `refreshSeriesQuestions` and the in-place update in `reconcileScheduleMeetups` don't change a `customSettings: true` meetup's items/claims/rides/min/window/questions, and still update a non-customized one. Questions endpoint: manager sets 2 questions → saved, `customSettings true`; answers to a removed question pruned; 6 questions → 400; Premium off with questions → 403 `premium_required`; non-manager non-creator → 403; past meetup → 400.
- [ ] Run → FAIL. Implement: add `customSettings: { $ne: true }` to the refresh queries (and the settings part of reconcile's update); new handler `updateMeetupQuestions` reusing `parseQuestions` + `pruneAnswers` and the same permission check as `updateMeetup`.
- [ ] Run → PASS; full `npm test`.

## Task 5 — Mobile API types
**Files:** `mobile/utils/api.ts`.
- [ ] Add to `Meetup`: `rsvpLeadDays?, rsvpLeadTime?, rsvpDeadlineDays?, rsvpDeadlineTime?, customSettings?, bringItems?, ridesEnabled?, questions?` (if not already typed). Add the same settings fields (optional) to `CreateOneOffMeetupPayload` and `UpdateMeetupPayload`. Add `meetupApi.updateMeetupQuestions(api, meetupId, { questions }) → { meetup }`.
- [ ] `npx tsc --noEmit` clean.

## Task 6 — `utils/meetupFormDraft.ts`
**Produces:** `MeetupDraft` { date ISO, time, endTime|null, timezone, location, description, maxAttendeesMode, maxAttendeesInput, rsvpRestricted, leadEnabled, leadDays, leadTime, deadlineEnabled, deadlineDays, deadlineTime, minAttendeesInput, bringItems: BringItemDraft[], ridesEnabled }; `draftForNew(group?: Group)`, `draftFromMeetup(m: Meetup)`, `validateDraft(d) → string|null` (first error), `createPayload(d)`, `updatePayload(original: MeetupDraft, d)` (only changed fields; RSVP fields sent as a group only if any RSVP field changed; items sent with `_id` when known).
- [ ] Tests: `draftFromMeetup` on a meetup with `rsvpDeadlineDays: null, rsvpLeadDays: null` → `rsvpRestricted false`; with deadline 0 @ 12:00 PM → `rsvpRestricted true, deadlineEnabled true`; `updatePayload(draft, draft)` → `{}`; changing only location → `{ location }` (review focus 5); turning off "Limit RSVPs" → `rsvpLeadDays: null, rsvpDeadlineDays: null, minAttendees: 0`; `validateDraft` reports the max-attendees error, the end-time error and the `getMinAttendeesError` message; `createPayload` with "Allow anytime" sends both days null.
- [ ] `npx jest utils/__tests__/meetupFormDraft.test.ts` → FAIL; implement; → PASS.

## Task 7 — Extract `RsvpRulesCard` and `CapacityCard`
**Produces:** `RsvpRulesCard({ value: RsvpRulesValue, onChange(patch), isPremium, owner, minError, onOpenPicker?() })` where `RsvpRulesValue` = the RSVP/min fields of the draft (same names as `ScheduleData`); `CapacityCard({ mode, input, onChange(patch) })`. Both own their time-picker open state.
- [ ] Render test (`components/__tests__/RsvpRulesCard.test.tsx`, pattern: `ActionSheet.test.tsx`): pressing "Limit RSVPs" calls `onChange({ rsvpRestricted: true })`; turning on Latest with lead 0 and lead on keeps days ≤ lead (same clamp as today).
- [ ] Run → FAIL; move the JSX/logic out of `ScheduleScreen.tsx` unchanged; use the cards in `ScheduleScreen.tsx` and `group-edit-schedule/[id].tsx`. → PASS; `tsc` clean.
- [ ] Manual check (device list, Task 10): both schedule screens look and behave as before.

## Task 8 — `MeetupForm`
**Consumes:** Tasks 5–7. **Produces:** `MeetupForm({ visible, mode, title, initialDraft, groupPicker?, isPremium, owner, questionsLink?: () => void, saving, onSubmit(draft), onClose })`.
- [ ] Render test: create mode shows "Add Meetup", sections Description/Where/When/RSVP Rules/Capacity/Premium and a "Create Meetup" button disabled while `validateDraft` returns an error; edit mode shows "Save"; the RSVP Questions row says "Set up after the meetup is created" without `questionsLink`.
- [ ] Run → FAIL; build it with `makeStyles` from `create-group/styles.ts`, the inline calendar from `AddMeetupWizard`, `EndTimeField`, timezone picker (read-only in edit), `LocationSearchModal`/`NativeTimePicker` as overlays (siblings of the ScrollView), `KeyboardAvoidingView behavior="padding"`. → PASS.

## Task 9 — Wire it in
**Files:** `AddMeetupWizard.tsx`, `MeetupDetailModal.tsx`, `app/group-questions/[id].tsx`.
- [ ] `AddMeetupWizard`: keep props and the group/new-group logic; render `MeetupForm`; Premium = picked group's `isPremium` or `usePremium().isPremium` for New Group; submit sends `createPayload`. Re-seed draft on open and on group change (as today).
- [ ] `MeetupDetailModal`: "Edit Meetup" opens `MeetupForm` (mode edit, `draftFromMeetup(meetup)`, `isPremium = meetup.group.isPremium !== false`, `questionsLink` → `router.push({ pathname: '/group-questions/[id]', params: { id: groupId, meetupId } })`); save sends `updatePayload`; delete the old edit modal and its now-unused state/styles. Careful: this file has uncommitted ActionSheet work — edit around it.
- [ ] Questions screen: with `meetupId`, load the meetup from the meetups cache (`['meetups']` query) and save via `updateMeetupQuestions`; title "RSVP Questions · this meetup".
- [ ] `npx tsc --noEmit` clean; `npx jest` for the touched test files PASS.

## Task 10 — Verify
- [ ] Backend `npm test` full; mobile `tsc` + jest on new/changed tests (full mobile jest on the owner's machine — OneDrive mount is slow).
- [ ] Reread spec + this plan line by line; fresh reviewer subagent checks the diff against the spec.
- [ ] Device checklist (owner): create one-off with Limit RSVPs + min 3 + items + rides (Premium group) → meetup shows items/rides, RSVPs close on time, cancels under minimum; same group without Premium → locked card, create works; New Group from the meetups tab; Edit a series meetup's items → edit the series' items → the meetup keeps its own; reschedule a customized meetup → RSVP window moves with it; questions on one meetup; both schedule screens unchanged; dark mode; Android back closes overlays first.
