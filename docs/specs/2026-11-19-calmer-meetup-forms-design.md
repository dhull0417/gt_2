# Calmer meetup & schedule forms — design

Date: 2026-11-19 · Size: project (4 screens, shared form kit, recurrence-editor merge, new validation)
Follows: `2026-11-19-calmer-teams-tourneys-design.md` (same visual language)

## Why
The schedule and meetup forms stack six cards, each with its own coloured left edge and icon tile
(blue, red, amber, purple, teal, indigo, plus a rainbow-edged Premium card and a colour per weekday). Long
sections expand inline (calendar, recurrence rules, RSVP steppers), so heights swing. And when something
required is missing, create-group and Edit Schedule just grey out the button without saying what.

## Screens in scope
1. Create group, step 2 "Set Recurring Meetups" — `components/create-group/ScheduleScreen.tsx`
2. Add Meetup (one-off) — `components/meetup-form/MeetupForm.tsx` via `AddMeetupWizard`
3. Edit Meetup — same `MeetupForm` via `MeetupDetailModal`
4. New / Edit Schedule — `app/group-edit-schedule/[id].tsx`
Name / Members / Review steps of create-group: only pick up colour/style changes from shared styles; no layout change.

## Goals
- One accent (brand). No per-section colours, coloured icon tiles, per-weekday colours, or rainbow border.
- Typed fields stay inline; everything else is a one-line summary row that opens a sheet.
- Every incomplete or invalid required area is red, says exactly what to do, and clears as soon as it's fixed.
- One recurrence ("When") editor and one validation source per draft type.

## Non-goals
- No change to API payloads (`createPayload`, `buildSchedulePayload`, etc.), server rules, or what can be configured.
- No change to Priority RSVP / RSVP Questions screens (rows still navigate to them).
- No change to create-group Name, Members, Review step layouts.

## Anti-goals
- No new bugs in recurrence building: the merged editor must produce identical drafts/payloads to today.
- A fresh, untouched form must not open covered in red.

## Decisions (user)
- Same calm style as Teams & Tourneys; Edit Schedule included.
- Recurring When moves behind one "When ›" row into a tall sheet.
- Incomplete required areas are highlighted red with a clear instruction.
- Save / Review / Create are always tappable; a tap with problems explains them instead of saving.
- Approach B: shared form kit, merged recurrence editor, shared checkers.

## Decisions (Claude's calls — correct if wrong)

### Shared kit (`components/ui/form/`)
- Move `GroupCard`, `SummaryRow`, `SettingSheet` from `components/tournament/ui.tsx` to
  `components/ui/form/` (tournament `ui.tsx` re-exports them, so tourney screens don't change).
- `SummaryRow` gains `error?: string` → red 1px border on the row, label in `colors.danger`, the error text
  replaces the value, chevron stays (still tappable). `disabledReason` unchanged. Premium-locked rows use
  `locked?: boolean` → lock icon + value "Premium".
- `SettingSheet` gains `asOverlay?: boolean` → renders as an absolutely-positioned layer instead of a
  native Modal (needed inside the MeetupForm Modal, matching how its pickers already work). Pickers that
  open from inside a sheet (time, calendar, timezone, location) also render as overlays on top of it.
- `FieldError` text style (12pt, danger, 600) for in-sheet messages; an in-sheet field with an issue gets
  the same red border.

### Validation (`utils/formIssues.ts`, unit-tested)
- `type FormArea = 'name' | 'where' | 'when' | 'timezone' | 'rsvp' | 'capacity' | 'bring' | 'group'`
- `interface Issue { area: FormArea; field: string; kind: 'invalid' | 'missing'; message: string }`
- `meetupIssues(d: MeetupDraft): Issue[]` and `scheduleIssues(d: RecurrenceDraft & ..., opts: { requireName: boolean }): Issue[]`.
- `validateDraft`, `isScheduleTabValid`, and Edit Schedule's `isScheduleValid` become
  `issues.length === 0` (or first message), so there is one rule set.
- Messages (exact):
  - name/missing: "Give this schedule a name"
  - when/missing frequency: "Pick how often"
  - when/missing daily: "Choose same time or varies"
  - when/missing weekday: "Pick a day for each row" (field per row id); none: "Add a day"
  - when/missing monthly mode: "Choose by date or by weekday"; dates: "Add at least one date"; ordinal: "Add at least one day"
  - when/missing long interval: "Finish the dates" (field from `isLongDraftValid` parts)
  - when/missing custom: "Add at least one rule"
  - when/invalid end time: the existing `endTimeError` / `scheduleEndTimeError` text
  - capacity/missing: "Enter how many people can come"; invalid: existing `getMaxAttendeesError` text
  - rsvp/invalid min: existing `getMinAttendeesError` text (only when RSVP limited AND deadline on — the value
    is only sent then)
  - bring/invalid: existing `getBringItemsError` text, with field = the offending item key
  - group/missing (Add Meetup "Which group?"): the existing `extraError` text
- Two rule unifications (were inconsistent): Edit Schedule now also checks end time (create-group did);
  the minimum check applies only when RSVP limited + deadline on everywhere (Edit Schedule blocked saving on
  a hidden field).
- A create-group series tab with no frequency stays "empty and valid" (unchanged).

### When red shows
- `kind: 'invalid'` → shown live as soon as it occurs.
- `kind: 'missing'` → shown after the first tap on Save / Review / Create on that screen (per series tab
  in create-group), then live until fixed.
- Tap with issues: no save; scroll to the first issue's row; footer shows "Fix 1 thing above" /
  "Fix N things above" in danger colour. Primary button always enabled except while saving.
- Create-group series tabs with issues (after a Review tap) show a red dot; Review switches to the first
  tab with issues.
- Edit Schedule's "No changes yet" hint stays; Save with no changes stays disabled (that's not an error).

### Recurrence editor (`components/schedule/RecurrenceEditor.tsx`)
- Single component replacing both copies of render{Daily,Weekday,Monthly,Ordinal,Custom}Options and
  `selectFreq`. Props: `value: RecurrenceDraft`, `onChange(patch)`, `issues: Issue[]`, `overlay host` hooks
  for its pickers. `RecurrenceDraft` = the shared recurrence fields of both `ScheduleData` types (they are
  field-identical for recurrence; Edit's adds timezone + showTZPicker).
- Before merging: characterisation tests on both screens' draft-building for each frequency
  (`buildSchedulePayload` / create-group equivalent) so the merged editor is proven to produce the same output.
- Weekday rows lose per-day colours; day shown as text.

### Sheet bodies
- `RsvpRulesCard` → `RsvpRulesSheet` body (same controls, no card chrome, brand accent instead of purple).
- `CapacityCard` → `CapacitySheet` body (Unlimited / Limited + number field).
- `PremiumFeaturesCard` splits into `BringItemsSheet` (item list editor) and a Rides switch row
  (Rides needs no sheet: the row has a switch). `PremiumFeaturesCard` and the rainbow edge are deleted once unused.

### Layout (all four screens)
1. Title / subtitle as today (Edit Schedule header bar as today).
2. Card "Details" (inline): Name (Edit Schedule only), Description, Where (opens location search as today).
3. Card "When": When ›, Timezone › (read-only, greyed, for Edit Meetup as today).
   - One-off When value: `Sat, Dec 6 · 7:00 PM` or `Sat, Dec 6 · 7:00–9:00 PM`. Sheet: calendar, time, end time.
   - Recurring When value: e.g. `Weekly · Tue, Thu · 7:00 PM`, `Monthly · 1st Sat`, `Daily · 7:00 PM`,
     `Custom · 2 rules`; empty: `Not set`. Sheet: frequency, the editor, start date.
4. Card "RSVP": RSVP rules › (`Anytime` / `Opens 5 days before · Closes 2 days before`; adds `· Min 4`),
   Capacity › (`Unlimited` / `Up to 12`).
5. Card "Premium" (plain card, small "Premium" label, no rainbow): Things to bring › (`None` / `3 items`),
   Rides (switch in the row), then Priority RSVP › and RSVP Questions › exactly as today (navigate, or
   "Set up after …" disabled). Non-Premium: rows `locked`; tapping opens a sheet with the upsell + UpgradeButton.
6. Footer as today, with the issue message replacing the greyed button.
- Create-group series tabs and Skip / Add More Series / Review unchanged in place.
- Hex colours removed from these files except `#fff` on brand buttons.

## Left to the builder
Exact spacing; summary string helpers' internal structure; overlay picker plumbing details within the
constraint that no second native Modal opens above MeetupForm.
