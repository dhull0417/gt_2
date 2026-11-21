# Priority RSVP open time — implementation plan

**Goal:** Organizers set the series' RSVP open time (when Group 1 starts) on the Priority RSVP screen and save it with the priority setup in one tap.

**Architecture:** The existing priority endpoint gains optional `openDays` / `openTime`, saves them onto the schedule with the tiers, recalculates meetups once (`refreshPriorityTiers`), and sends the usual "Schedule Updated" push only when the open time changed. The Priority RSVP screen gets an "RSVPs open" card that starts from the edit screen's unsaved values (route params) or the saved series. The edit screen adopts a newly saved open time when it regains focus.

**Tech stack:** Express + Mongoose (node:test with module mocks), Expo / React Native + TypeScript (jest).

**Spec:** `docs/specs/2026-11-21-priority-rsvp-open-time-design.md`

**Global constraints**
- `openDays`: integer 0–365. `openTime`: matches `TIME_RE` (`/^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/`).
- Defaults when the series has no open time: 1 day before, `"09:00 AM"`.
- Open must be at or before the deadline: `openDays > deadlineDays`, or equal days and open time ≤ deadline time. Only checked when the series has a deadline.
- `openDays` / `openTime` are read only when `enabled === true`; both missing → today's behaviour.
- No commits: leave everything uncommitted (user rule).

**Review focus**
1. Same day as the deadline with a later time → 400 (Task 1 test).
2. `{ enabled: false, openDays: 3 }` leaves the open time alone (Task 1 test).
3. Older client: no `openDays` on a series with no open time → existing 400 (Task 1 test).
4. Push sent only when the open time actually changed, not on re-saving the same value (Task 1 test).
5. Edit screen keeps an unsaved open time when the priority screen was left without saving (Task 3 test).

## File map
- Modify `backend/src/controllers/group.controller.js`: `updateSchedulePriority`.
- Create `backend/src/controllers/priorityOpenTime.handlers.test.mjs`.
- Create `mobile/utils/priorityOpenTime.ts` + `mobile/utils/__tests__/priorityOpenTime.test.ts`: starting value for the card.
- Modify `mobile/utils/editScheduleDraft.ts` + `mobile/utils/__tests__/scheduleDrafts.test.ts`: `syncSavedLead`.
- Modify `mobile/components/schedule/sheets.tsx`: export `Stepper`.
- Modify `mobile/utils/api.ts`: body type of `updateSchedulePriority`.
- Modify `mobile/app/group-priority/[id].tsx`: card, save, remove the no-window block.
- Modify `mobile/app/group-edit-schedule/[id].tsx`: pass params, sync on focus.

## Task 1: Endpoint saves the open time
**Files:** `group.controller.js`, new `priorityOpenTime.handlers.test.mjs` (stubs set up the same way as `scheduleEndDate.handlers.test.mjs`; capture `notifyAndPersist`; stub `refreshPriorityTiers` via module mock of `../utils/priorityRsvp.js` keeping the constants).
**Produces:** `PUT …/priority` accepts `{ enabled, order, tiers, quiet, openDays?, openTime? }`.
- [x] Tests:
  - `saves open time with tiers`: series lead null, body `enabled:true, openDays:2, openTime:"7:00 PM"` → 200; `target.generationLeadDays === 2`, `generationLeadTime === "7:00 PM"`, `priorityEnabled === true`; refresh called once.
  - `rejects open time after deadline on same day`: deadline 1 day / "09:00 AM", body openDays 1, "10:00 AM" → 400, lead unchanged.
  - `rejects bad openDays / openTime`: openDays -1, 366, 1.5, and openTime "25:00" → 400.
  - `ignores open time when turning off`: `{ enabled:false, openDays:3 }` → lead unchanged.
  - `older client without openDays and no open time` → 400 "Set when RSVPs open…".
  - `push only on change`: changing 2→3 days sends one push with `type: 'schedule-updated'`; re-sending the saved value sends none.
- [x] Run `npm test` in backend → new tests FAIL (open time not saved / no 400).
- [x] Implement in `updateSchedulePriority`: take `scheduleBefore = scheduleSnapshot(target, group.timezone)` first; inside the `enabled` branch, before the existing no-lead check, if `openDays !== undefined` validate per Global constraints and set `target.generationLeadDays` / `generationLeadTime`. After `refreshPriorityTiers`, build `scheduleChanges(before, after)` and send the same push block used by `updateSchedule` when non-empty (in a try/catch, as there).
- [x] Run the full backend suite → PASS.

## Task 2: Card starting value (mobile helper)
**Files:** `mobile/utils/priorityOpenTime.ts`, test.
**Produces:** `priorityOpenStart(saved: { generationLeadDays?: number|null; generationLeadTime?: string; generationDeadlineDays?: number|null; generationDeadlineTime?: string }, params: { leadDays?: string; leadTime?: string; deadlineDays?: string; deadlineTime?: string }): RsvpRulesValue` (shape from `rsvpRules.ts`, with `rsvpRestricted:true, leadEnabled:true`, `minAttendeesInput:""`).
- [x] Tests: params win over saved; saved used when no params; neither → 1 / "09:00 AM"; deadline from params (`deadlineDays` "" = none → `deadlineEnabled:false`), else saved; a non-numeric `leadDays` param falls back to saved.
- [x] Run `npx jest priorityOpenTime` → FAIL (module missing).
- [x] Implement. Run → PASS.

## Task 3: Edit screen adopts a saved open time
**Files:** `editScheduleDraft.ts`, `scheduleDrafts.test.ts`, `group-edit-schedule/[id].tsx`.
**Produces:** `syncSavedLead(draft: ScheduleData, baseline: ScheduleData, saved: { generationLeadDays?: number|null; generationLeadTime?: string }): { draft: ScheduleData; baseline: ScheduleData } | null`.
- [x] Tests: saved equals baseline lead → null; saved differs → both draft and baseline get `rsvpRestricted:true, leadEnabled:true, leadDays, leadTime`, other draft edits kept (e.g. an edited name stays); saved null → null.
- [x] Run jest → FAIL. Implement → PASS.
- [x] Screen: (as built: a `useEffect` on the saved open time, which updates when the group refetches after the priority Save; no focus hook needed) runs `syncSavedLead(d, originalRef.current, targetSchedule)` and applies the result. The Priority RSVP row passes `leadDays/leadTime` (only when `d.rsvpRestricted && d.leadEnabled`) and `deadlineDays/deadlineTime` (`""` when no deadline) as string params.
- [x] Run full mobile jest (incl. `EditScheduleScreen.test.tsx`) → PASS.

## Task 4: Priority screen card and save
**Files:** `group-priority/[id].tsx`, `sheets.tsx` (export `Stepper`), `api.ts`.
**Consumes:** Task 1 body, Task 2 helper.
- [x] Add optional `openDays?: number; openTime?: string` to the `updateSchedulePriority` body type.
- [x] State `open` = `priorityOpenStart(schedule, params)` on load. Under the switch, while enabled: section "RSVPs open", card with `Stepper` ("Day of" / "N days before", via `stepLead`) and `TimeField` "At" (via `setLeadTime`, showing its alert), hint "Group 1 can start RSVPing at this time."
- [x] Remove the `noRsvpWindow` block and its Save disabling; `showList = enabled && isPremium`.
- [x] Save sends `openDays: open.leadDays, openTime: open.leadTime` when enabled.
- [x] Update the intro text: drop "in this series' settings"-style wording; keep the cascade explanation.
- [x] `npx tsc --noEmit` in mobile clean for touched files; full mobile jest → PASS.

## Task 5: Verify
- [x] Reread spec line by line against the change; both suites green; fresh reviewer pass over the diff.
