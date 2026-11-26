# Premium Preview Implementation Plan

**Goal:** Free users can fully set up Premium settings in the meetup/schedule forms; the confirm button becomes "Premium" (owner) or a disabled "Owner needs Premium" (non-owner) when a Premium feature is in use.

**Architecture:** One pure helper module decides "is a Premium feature in use" and which footer button to show. A small shared button component and an owner hook are reused by the three forms (create group, Add/Edit Meetup, Edit Schedule). Rows and sheets stop locking; the backend gate is untouched.

**Tech stack:** Expo / React Native, expo-router, TanStack Query, Jest (jest-expo) + React Native Testing Library. Run tests from `mobile/` with `npx jest <path>`.

**Spec:** `docs/specs/2026-11-21-premium-preview-design.md`. Work on branch `premium-preview` (from `staging`).

## Global constraints
- Exact copy: button labels `Premium` and `Owner needs Premium`; accessibility labels identical to the visible text.
- Hints: upgrade → `Premium is needed to save these settings.`; ownerNeeds → `The group owner needs Premium to save these settings.`; section note → `Set these up now. Premium is needed to save them.`
- No backend, RevenueCat, or `/paywall` screen changes. No new dependencies.
- Priority RSVP, and the Manage-questions row for existing schedules/meetups, stay locked for free users (phase 2).
- Premium button always works (even if the form has validation problems); problems show after purchase on the normal confirm tap.
- Commits end with the attribution lines from the session reminder.

## Review focus
1. Lapsed-Premium group with saved premium values: editing an unrelated field must still show Save (compare to baseline). → Task 1, Task 5, Task 6 tests.
2. Minimum headcount typed but RSVP window or deadline is off (so it would not be saved): must not count as "in use". → Task 1.
3. Blank rows (empty bring item name, empty question prompt, minimum `0`) must not count. → Task 1.
4. Non-owner on a new meetup in someone else's group sees a disabled button, and tapping it does nothing. → Task 5.
5. After a purchase the group's `isPremium` must refresh, not only `currentUser`. → Task 7.

## File map
- Create `mobile/utils/premiumGate.ts`: pure rules (in-use, mode, hint copy).
- Create `mobile/hooks/useIsGroupOwner.ts`: is the signed-in user this group's owner.
- Create `mobile/components/PremiumSubmitButton.tsx`: the footer button for `upgrade` / `ownerNeeds`.
- Create `mobile/components/schedule/PremiumPreviewNote.tsx`: the one-line section note.
- Modify `mobile/components/UpgradeButton.tsx` (use the hook), `schedule/MinimumToMeetField.tsx`, `schedule/sheets.tsx`, `create-group/ScheduleScreen.tsx`, `meetup-form/MeetupForm.tsx`, `app/group-edit-schedule/[id].tsx`.
- Tests: `utils/__tests__/premiumGate.test.ts`, `hooks/__tests__/useIsGroupOwner.test.tsx`, `components/__tests__/PremiumSubmitButton.test.tsx`, and updates to `ScheduleScreen`, `MeetupForm`, `EditScheduleScreen` tests and `schedule/__tests__/sheets.test.tsx`.

---

## Task 1: Premium gate rules (pure)
**Files:** create `mobile/utils/premiumGate.ts`, `mobile/utils/__tests__/premiumGate.test.ts`.
**Produces:**
```ts
export type PremiumDraft = { bringItems: { name: string; max: string }[]; ridesEnabled: boolean;
  questions?: { prompt: string; type: string; options: string[]; required: boolean }[];
  minAttendeesInput: string; rsvpRestricted: boolean; deadlineEnabled: boolean };
export const premiumFeaturesInUse = (d: PremiumDraft): { bring: boolean; rides: boolean; questions: boolean; minimum: boolean };
export const usesPremiumFeatures = (d: PremiumDraft, baseline?: PremiumDraft): boolean;
export type SubmitMode = 'confirm' | 'upgrade' | 'ownerNeeds';
export const submitMode = (a: { usesPremium: boolean; isPremium: boolean; isOwner: boolean }): SubmitMode;
export const submitHint = (mode: SubmitMode): string; // '' for confirm
```
Rules: bring = some item with `name.trim()`; rides = `ridesEnabled`; questions = some `prompt.trim()`; minimum = `rsvpRestricted && deadlineEnabled && parseInt(minAttendeesInput) > 0`. `usesPremiumFeatures` = any in use AND (no baseline OR the normalized premium fields differ from baseline's). `submitMode`: `isPremium || !usesPremium` → confirm; else owner → upgrade, non-owner → ownerNeeds.

- [ ] Write failing tests: each feature alone → true; blank bring name `"  "` → false; question prompt `" "` → false; minimum `"5"` with `rsvpRestricted:false` → false, with restricted but `deadlineEnabled:false` → false, with both → true, `"0"` → false; draft equal to baseline with bring item `Chips` → false, baseline `[]` → true; `submitMode` for the 6 combos (premium/free × uses/not × owner/not: only free+uses gives upgrade/ownerNeeds); `submitHint('confirm')===''` and the two exact hint strings.
- [ ] Run `npx jest utils/__tests__/premiumGate.test.ts` → FAIL ("Cannot find module '../premiumGate'").
- [ ] Implement the module as specified.
- [ ] Run → PASS; run full `npx jest` → PASS.
- [ ] Commit `Add premium gate rules`.

## Task 2: Owner hook, submit button, section note
**Files:** create `hooks/useIsGroupOwner.ts`, `components/PremiumSubmitButton.tsx`, `components/schedule/PremiumPreviewNote.tsx`, tests `hooks/__tests__/useIsGroupOwner.test.tsx`, `components/__tests__/PremiumSubmitButton.test.tsx`; modify `components/UpgradeButton.tsx`.
**Produces:** `useIsGroupOwner(owner?: string | {_id: string} | null): boolean` (same `['currentUser']` query as `UpgradeButton`; false while loading or if no owner). `PremiumSubmitButton({ mode: 'upgrade' | 'ownerNeeds'; style?: StyleProp<ViewStyle> })`. `PremiumPreviewNote()` renders the section-note string.
- [ ] Failing tests: hook returns true for matching id (string and populated object), false for other id / no owner / loading. Button `upgrade`: text `Premium`, press calls `router.push('/paywall')` once. Button `ownerNeeds`: text `Owner needs Premium`, `accessibilityState.disabled === true`, press does not call push.
- [ ] Run → FAIL (modules missing).
- [ ] Implement. Button uses `PressableOpacity`, `colors.brand` background, star icon for `upgrade`, 0.5 opacity when `ownerNeeds`; accepts the host's `s.primaryBtn` style. Refactor `UpgradeButton` to call the hook (its render conditions unchanged: hidden for non-owner or Premium).
- [ ] Run new tests → PASS; full `npx jest` → PASS (UpgradeButton consumers still mock it).
- [ ] Commit `Add owner hook, premium submit button and preview note`.

## Task 3: Unlock the shared sheets
**Files:** modify `components/schedule/MinimumToMeetField.tsx`, `components/schedule/sheets.tsx`, `components/schedule/__tests__/sheets.test.tsx`.
**Consumes:** nothing new. **Changes:** `MinimumToMeetField` and `RsvpRulesSheet` lose `isPremium` and `owner` props (all callers updated in Tasks 4-6; TypeScript will flag any miss). The field always shows the input (still the Premium pill; still "Turn on Latest time to RSVP" when the deadline is off). `PremiumUpsellSheet` is unchanged (still used for Priority RSVP / existing-items rows).
- [ ] Update `sheets.test.tsx`: replace any "free user sees Get Premium in Minimum to Meet" expectation with "free user can type a minimum when the deadline is on" (`getByLabelText('Minimum to meet')`, type `5`, `onChange` called with `{ minAttendeesInput: '5' }`).
- [ ] Run `npx jest components/schedule` → FAIL (still locked).
- [ ] Implement the prop removal and always-on input.
- [ ] Run `npx tsc --noEmit` → expect errors only at the three call sites (fixed next); jest `components/schedule` → PASS.
- [ ] Commit `Unlock Minimum to Meet and RSVP rules sheet for free users`.

## Task 4: Create group (ScheduleScreen)
**Files:** modify `components/create-group/ScheduleScreen.tsx`, `components/__tests__/ScheduleScreen.test.tsx`.
**Consumes:** Task 1-3. Owner is always the current user here (`isOwner = true`).
- [ ] Failing tests (mock `usePremium` → `{isPremium:false,userId:'u1'}`, mock `expo-router`): a free user sees no `row-lock` among Food/Rides/Questions; pressing `Food/Things to bring` opens the bring sheet; footer still says `Review` when nothing premium is set; after turning Rides on the footer shows `Premium` (not `Review`) and the hint `Premium is needed to save these settings.`; pressing `Premium` calls `router.push('/paywall')` and `onNext` is not called; the section note is visible. Existing Premium-user tests unchanged (`Review` still calls `onNext`).
- [ ] Run → FAIL.
- [ ] Implement: `premiumRow` always opens the sheet / uses the switch (drop the locked branch; keep `PremiumUpsellSheet` only if still referenced, else remove its import and `"upsell"` sheet state); compute `mode = submitMode({ usesPremium: usesPremiumFeatures(d), isPremium, isOwner: true })`; footer renders `PremiumSubmitButton` (style `s.reviewBtnGhost`) when mode ≠ confirm, else the existing Review button; hint text from `submitHint` when mode ≠ confirm, otherwise the existing `attempted` message; add `PremiumPreviewNote` under the Premium label when `!isPremium`; update the `RsvpRulesSheet` call (drop `isPremium`/`owner`).
- [ ] Run → PASS; full `npx jest` → PASS; `npx tsc --noEmit` clean for this file.
- [ ] Commit `Create group: set up Premium settings before upgrading`.

## Task 5: Add / Edit Meetup (MeetupForm)
**Files:** modify `components/meetup-form/MeetupForm.tsx`, `components/__tests__/MeetupForm.test.tsx`. Hosts (`AddMeetupWizard`, `MeetupDetailModal`) keep their props; no change needed.
**Consumes:** `useIsGroupOwner(owner)`; `baseline = useRef(mode === 'edit' ? draft : undefined)` (edit forms mount fresh per edit in `MeetupDetailModal`).
- [ ] Failing tests (mock `@/hooks/useIsGroupOwner` and `expo-router`; remove the old `without Premium, premium rows are locked` test): free + owner, create mode, Rides on → footer shows `Premium`, press → `push('/paywall')`, `onSubmit` not called; free + non-owner → `Owner needs Premium`, disabled, press does nothing; free + nothing premium → `Create Meetup` submits; **edit mode, free group whose draft already has a bring item (baseline equal) → `Save` still submits**; edit mode, free, existing `questionsLink` → RSVP Questions row is still locked; create mode, free → RSVP Questions opens the questions sheet.
- [ ] Run → FAIL.
- [ ] Implement: rows unlocked (RSVP Questions: `questionsLink && !isPremium` → locked row, `questionsLink && isPremium` → Manage, else sheet); footer swaps to `PremiumSubmitButton` by `submitMode`; hint and section note as in Task 4; `RsvpRulesSheet` call updated.
- [ ] Run → PASS; full `npx jest`; `npx tsc --noEmit`.
- [ ] Commit `Add/Edit Meetup: set up Premium settings before upgrading`.

## Task 6: Edit / Create schedule (Group Settings)
**Files:** modify `app/group-edit-schedule/[id].tsx`, `components/__tests__/EditScheduleScreen.test.tsx`.
**Consumes:** `useIsGroupOwner(group?.owner)`; `baseline = originalRef.current ?? undefined`.
- [ ] Failing tests (the screen's group mock gets `isPremium:false`, `owner:'u1'`; mock `useIsGroupOwner`): new schedule, free, owner, add a bring item → `Premium` shown instead of `Create Schedule`, press → push `/paywall`, `createSchedule` not called; non-owner → `Owner needs Premium` disabled; free, nothing premium → `Create Schedule` works as before; existing schedule with saved bring items on a lapsed group, edit the name only → `Save Changes` still saves; Priority RSVP row still locked for free users; for a **new** schedule free users can open RSVP Questions sheet.
- [ ] Run → FAIL.
- [ ] Implement as in Task 5 (existing-schedule Priority RSVP and Manage Questions stay locked; new-schedule Questions row opens the sheet for free users too). Existing `unchanged` disabling applies only to `confirm` mode.
- [ ] Run → PASS; full `npx jest`; `npx tsc --noEmit`.
- [ ] Commit `Edit schedule: set up Premium settings before upgrading`.

## Task 7: Verify
- [ ] `grep -n "queryKey" mobile/hooks/useGetGroupDetails.ts` shows `['groupDetails', ...]`, matching what `useRefreshPremium` invalidates (review focus 5). If it does not, stop and raise.
- [ ] Run `npx jest`, `npx tsc --noEmit`, and the project's lint script (`npm run lint` if present) from `mobile/` → all pass.
- [ ] Reread the spec line by line against the diff; tick each behaviour.
- [ ] **Needs a device (cannot be run here):** with a free owner, open Add Meetup, turn Rides on, tap `Premium`. The paywall must appear above the form and the draft must survive closing it. If it renders behind the native Modal or the draft is lost, **stop and raise it** (the spec lists this as a known risk); do not improvise a different design.
- [ ] Final reviewer pass: a fresh subagent checks the whole diff against the spec.
