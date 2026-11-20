# Calmer meetup & schedule forms — implementation plan

> **Status 2026-11-19:** Tasks 1–12 implemented. Full jest suite 597/597, tsc clean. Not committed. Manual device checks (Tasks 9–11) still to do.
> Deviations: create-group's schedule step no longer renders series tabs, so the tab red dot / jump-to-tab was not needed; long-interval messages are specific ("Pick the first date", "Choose how it repeats") instead of "Finish the dates"; create-group skips the name check (the series takes the group's name). Old cards and LongIntervalOptions moved to `_to_delete/calm-forms-removed/` (deletion isn't permitted in this folder).

**Goal:** Restyle create-group step 2, Add/Edit Meetup and New/Edit Schedule into one-accent summary rows + sheets, with red, instructive errors and one shared recurrence editor and checker.

**Architecture:** Shared form kit in `components/ui/form/` (rows, cards, sheets with an overlay mode). Pure logic in `utils/`: `formIssues.ts` (validation), `recurrenceDraft.ts` (recurrence edits), `formSummaries.ts` (row text). One `RecurrenceEditor` plus small sheets in `components/schedule/`. The four screens become thin layouts over these.

**Tech stack:** Expo / React Native, TypeScript, jest-expo + @testing-library/react-native.

**Spec:** `docs/specs/2026-11-19-calmer-meetup-forms-design.md`

**Global constraints**
- Accent `colors.brand`; errors `colors.danger`. No hex colours in touched files except `#fff` on brand buttons.
- No change to `createPayload`, `editPayload`/meetup update builders, either `buildSchedulePayload`, or API calls.
- Inside `MeetupForm` (a native Modal) no second native Modal: sheets and pickers use `asOverlay`.
- Error copy exactly as the spec's Validation section.
- Picker visibility lives in component state, not drafts (draft `show*` fields stay in the types, unused, default false; `hasChanged` compares payloads so is unaffected).
- Tests: `npx jest` (full suite) and `npx tsc --noEmit` from `mobile/`. Run in the container test mirror; sync edited files each run.
- No commits (unrelated uncommitted work in the tree); changes left for the user.

**Review focus** (each has a test in the named task)
1. Recurrence edits produce the same drafts as today for every frequency (Task 4 characterisation tests).
2. A fresh form shows no red; `missing` issues appear only after a submit attempt; `invalid` ones live (Task 7).
3. Minimum check only when RSVP limited + deadline on (Task 2); Edit Schedule now checks end time (Task 3).
4. An empty create-group series tab (no frequency) has no issues (Task 3).
5. Tapping Save with issues does not call save (Tasks 9–11).

## File map
| File | Change | Responsibility |
|---|---|---|
| `components/ui/form/index.tsx` | create | GroupCard, SummaryRow (+error, locked), SettingSheet (+asOverlay), FieldError, styles |
| `components/ui/form/__tests__/form.test.tsx` | create | kit tests (tournament ui tests move here) |
| `components/tournament/ui.tsx` | modify | re-export the moved pieces |
| `utils/formIssues.ts` + test | create | `Issue`, `meetupIssues`, `scheduleIssues`, `visibleIssues`, `fixMessage` |
| `utils/meetupFormDraft.ts`, `utils/createGroupDraft.ts` | modify | `validateDraft` / `isScheduleTabValid` delegate to issues |
| `utils/recurrenceDraft.ts` + test | create | pure recurrence edits (select frequency, rows, monthly, ordinal, custom) |
| `utils/formSummaries.ts` + test | create | row value strings |
| `components/schedule/RecurrenceEditor.tsx` | create | the one When editor |
| `components/schedule/sheets/{OneOffWhenSheet,RecurrenceWhenSheet,RsvpRulesSheet,CapacitySheet,BringItemsSheet,PremiumUpsellSheet}.tsx` | create | sheet bodies |
| `components/schedule/__tests__/*.test.tsx` | create | editor + sheet tests |
| `components/meetup-form/MeetupForm.tsx` | modify | new layout + submit-issues flow |
| `components/create-group/ScheduleScreen.tsx` | modify | new layout, tab dots, Review jump |
| `app/group-edit-schedule/[id].tsx` | modify | new layout + submit-issues flow |
| `components/schedule/{RsvpRulesCard,CapacityCard,PremiumFeaturesCard}.tsx` | delete when unused (Task 13) | |

---

### Task 1 — Move and extend the form kit
**Files:** `components/ui/form/index.tsx`, `components/ui/form/__tests__/form.test.tsx`, `components/tournament/ui.tsx`
**Produces:** `GroupCard`, `SummaryRow({ label, value, onPress, disabledReason?, error?: string, locked?: boolean, right?: ReactNode, testID?, onLayoutY?: (y:number)=>void })`, `SettingSheet({ visible, title, onClose, children, asOverlay?: boolean })`, `FieldError({ message })`.
- [ ] Move the existing three tests from `components/tournament/__tests__/ui.test.tsx`; add failing tests:
  - `error="Pick how often"` shows that text instead of value, row still calls `onPress`, label has danger colour (assert style).
  - `locked` shows "Premium" and a lock icon (testID `row-lock`), and still calls `onPress`.
  - `right={<Switch/>}` renders the switch and no chevron.
  - `SettingSheet asOverlay` renders without a `Modal` (`UNSAFE_queryByType(Modal)` null) and Done calls `onClose`.
- [ ] Run → FAIL; implement (tournament `ui.tsx` re-exports from `@/components/ui/form`); run → PASS; full suite + tsc.

### Task 2 — Meetup issues
**Files:** `utils/formIssues.ts`, `utils/__tests__/formIssues.test.ts`, `utils/meetupFormDraft.ts`
**Produces:** `Issue`, `FormArea`, `meetupIssues(d: MeetupDraft, extraError?: string | null): Issue[]`.
- [ ] Failing tests (one per rule, exact messages from spec): limited + "" → `{area:'capacity',field:'capacityInput',kind:'missing',message:'Enter how many people can come'}`; limited + "0" → capacity/invalid with `getMaxAttendeesError` text; end before start → when/invalid field `endTime`; min > capacity with restricted+deadline → rsvp/invalid field `minAttendees`; same values with deadline off → no rsvp issue; bring item with empty name → bring/invalid field = item key; extraError → group/missing; valid default draft → `[]`.
- [ ] Existing `meetupFormDraft.test.ts` `validateDraft` tests still pass after `validateDraft = d => meetupIssues(d)[0]?.message ?? null`.
- [ ] FAIL → implement → PASS; full suite.

### Task 3 — Schedule issues
**Files:** `utils/formIssues.ts` + test, `utils/createGroupDraft.ts`
**Produces:** `scheduleIssues(d: ScheduleLike, opts: { requireName: boolean }): Issue[]` where `ScheduleLike` is the shared field set of both `ScheduleData` types.
- [ ] Failing tests: no frequency → `[]` (create-group empty tab) — but `opts.requireName` + frequency null → when/missing "Pick how often" when called with `{ emptyIsValid: false }` (Edit Schedule); add that option. daily + dailySameTime null → "Choose same time or varies"; weekly with no rows → "Add a day"; weekly row day null → field `weekday:<id>` "Pick a day for each row"; monthly no mode / no dates / no ordinals; long frequency invalid → "Finish the dates"; custom no routines → "Add at least one rule"; end-time error → when/invalid; name blank with requireName → name/missing; capacity/min/bring same as Task 2; min check skipped when deadline off.
- [ ] `isScheduleTabValid = sch => scheduleIssues(sch, { requireName: true, emptyIsValid: true }).length === 0`; existing `scheduleDrafts.test.ts` still passes.
- [ ] FAIL → implement → PASS; full suite.

### Task 4 — Pure recurrence edits (characterisation first)
**Files:** `utils/recurrenceDraft.ts`, `utils/__tests__/recurrenceDraft.test.ts`
**Produces:** `selectFrequency(d, f)`, `addWeekdayRow(d, id)`, `updateWeekdayRow(d, id, patch)`, `removeWeekdayRow(d, id)`, `addMonthlyDate(d, id)`, `updateMonthlyDate`, `removeMonthlyDate`, `addOrdinal(d, id)`, `updateOrdinal`, `removeOrdinal`, and the custom-builder ops found in both screens (`startCustom`, `setCustomFreq`, `addBuiltRoutine`, `removeBuiltRoutine` — exact set = union of the two screens' functions). Each returns a new draft (ids passed in for determinism).
- [ ] Read both screens' handlers side by side; list every behavioural difference (known: Edit's new weekday row sets `showDayPicker: true` — a UI flag, dropped). Record the list at the top of the test file.
- [ ] Write tests asserting today's results (from create-group's code) for each op, e.g. `selectFrequency(draftWithWeeklyRows,'monthly')` clears dailySameTime/weekdayRows/monthly/ordinal/long/custom fields; `addWeekdayRow(d,'r1')` appends `{ id:'r1', day:null, time:'05:00 PM', startDate: today, showTimePicker:false }`; monthly default `{ date:1, time:'05:00 PM', expanded:true }`.
- [ ] Add a payload check per frequency: build a draft via the ops, then `buildSchedulePayload` from both `createGroupDraft` and `editScheduleDraft` → equal to a fixed expected payload.
- [ ] FAIL → implement → PASS; full suite.

### Task 5 — Summary strings
**Files:** `utils/formSummaries.ts` + test
**Produces:** `oneOffWhenSummary(date, time, endTime)` → `Sat, Dec 6 · 7:00 PM` / `Sat, Dec 6 · 7:00–9:00 PM`; `recurrenceSummary(d)` → `Not set`, `Daily · 7:00 PM`, `Daily · Varies`, `Weekly · Tue, Thu · 7:00 PM` (times differ → `· Varies`), `Every 2 weeks · …`, `Monthly · 1st, 15th`, `Monthly · 1st Sat`, long via `longRoutineLabel`, `Custom · 2 rules`; `rsvpSummary(d)` → `Anytime` / `Opens 5 days before · Closes 2 days before` / one side only / `+ · Min 4`; `capacitySummary` → `Unlimited` / `Up to 12`; `bringSummary(items)` → `None` / `1 item` / `3 items`.
- [ ] Tests for each listed output → FAIL → implement → PASS.

### Task 6 — RecurrenceEditor
**Files:** `components/schedule/RecurrenceEditor.tsx`, `components/schedule/__tests__/RecurrenceEditor.test.tsx`
**Consumes:** Task 4 ops, Task 1 kit, `LongIntervalOptions`, `EndTimeField`, `NativeTimePicker asOverlay`, `InlineCalendar`.
**Produces:** `RecurrenceEditor({ value, onChange: (next: ScheduleLike) => void, issues: Issue[], minDate, maxDate })` — owns picker state; pickers render as overlays inside it; frequency choice is an inline `OptionRow` list (no OptionPickerModal); day choice is a 7-chip row (no modal); start dates use `InlineCalendar`.
- [ ] Failing tests: choosing "Weekly" calls onChange with `selectFrequency(value,'weekly')`; "Add a day" appends a row; tapping "Tue" on a row sets day 2; an issue with field `weekday:r1` renders "Pick a day for each row" under that row with danger border; no hex day colours (row has no `borderLeftColor`).
- [ ] FAIL → implement (port JSX from ScheduleScreen's render* functions, styles from `create-group/styles` neutralised) → PASS; full suite.

### Task 7 — Sheets and submit flow helpers
**Files:** `components/schedule/sheets/*.tsx`, tests; `utils/formIssues.ts` (+`visibleIssues`, `fixMessage`)
**Produces:**
- `visibleIssues(issues, attempted)` → invalid always, missing only if attempted. `fixMessage(n)` → `''` / `Fix 1 thing above` / `Fix N things above`. `firstArea(issues, order: FormArea[])`.
- `OneOffWhenSheet` (InlineCalendar + time + EndTimeField), `RecurrenceWhenSheet` (RecurrenceEditor + start date), `RsvpRulesSheet` (RsvpRulesCard body, brand accent), `CapacitySheet`, `BringItemsSheet`, `PremiumUpsellSheet` (lockedNote + UpgradeButton). All accept `asOverlay` and `issues`.
- [ ] Failing tests: `visibleIssues` cases (fresh → only invalid); `fixMessage(2)`; CapacitySheet "Limited" shows input and a capacity issue renders its message; BringItemsSheet "Add item to bring" adds a row and an item issue reddens that row; RsvpRulesSheet toggling "Limit RSVPs" patches `rsvpRestricted: true`.
- [ ] FAIL → implement → PASS; full suite.

### Task 8 — Row error/scroll plumbing
**Files:** `components/ui/form/useIssueScroll.ts` + test
**Produces:** `useIssueScroll(scrollRef)` → `{ register(area) => onLayout handler, scrollTo(area) }` (stores y per area, scrolls with 16pt offset).
- [ ] Test with a mock scrollRef: register 'when' at y=300 then `scrollTo('when')` calls `scrollTo({ y: 284, animated: true })`.

### Task 9 — MeetupForm (Add + Edit)
**Files:** `components/meetup-form/MeetupForm.tsx`, `components/__tests__/MeetupForm.test.tsx`
- [ ] Update/add tests first: fresh create form shows no "Fix" text; set capacity limited with blank, press "Create Meetup" → `onSubmit` not called, "Fix 1 thing above" shown, Capacity row shows "Enter how many people can come"; enter "10" → message gone; valid press → `onSubmit` called; Edit mode timezone row disabled.
- [ ] Rewrite layout per spec (Details card, When card, RSVP card, Premium card, footer); all sheets `asOverlay`; button disabled only while saving.
- [ ] Run → PASS; full suite + tsc. Manual: iOS + Android, light/dark — every row opens, pickers inside sheets open, Android back closes the top overlay first.

### Task 10 — Create-group schedule step
**Files:** `components/create-group/ScheduleScreen.tsx`
- [ ] Tests (new `components/__tests__/ScheduleScreen.test.tsx`): Review with an incomplete started tab → `onNext` not called, red dot on that tab (testID `tab-issue-<i>`), active tab switches to it; empty tab only → `onNext` called; Skip unchanged.
- [ ] Rewrite When/RSVP/Premium as rows + sheets (native sheets fine here), Description + Where inline; remove day colours.
- [ ] PASS; full suite + tsc; manual run through create-group with weekly, monthly, custom, quarterly.

### Task 11 — New/Edit Schedule
**Files:** `app/group-edit-schedule/[id].tsx`
- [ ] Tests (new `app/__tests__/editSchedule.test.tsx` if the screen can be rendered with mocked queries; otherwise test `scheduleIssues` usage via Task 3 and rely on manual): Save with blank name → no save call, Name field red "Give this schedule a name".
- [ ] Replace inline recurrence code with `RecurrenceWhenSheet`; Name/Description/Where card; timezone row; drop chip colour constants and the local `s` hex styles in favour of theme colours; keep "No changes yet" + disabled-when-unchanged; end-time Alert replaced by the inline issue.
- [ ] PASS; full suite + tsc; manual: edit an existing weekly series, change a time, save → same payload as before (compare network body).

### Task 12 — Remove the old cards and colours
- [ ] Delete `RsvpRulesCard`, `CapacityCard`, `PremiumFeaturesCard` (+ `premiumColors`/`PremiumRainbowLabel` if unused) after `grep` shows no imports; remove `DAY_COLORS`/`dayColors`.
- [ ] `grep -n "#[0-9A-Fa-f]\{6\}"` over the four screens and new files → only `#fff` remains.
- [ ] Full suite + tsc.

### Final
- [ ] Reread spec line by line; check each error message on device; fresh-eyes review of the full diff against spec and Review focus.
