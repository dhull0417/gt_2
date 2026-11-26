# Schedule End Date — Design

Date: 2026-11-20 · Status: draft, awaiting approval · Size: medium (backend + mobile)

## Intent
Leagues and seasonal groups run for a known stretch. Organizers can already pick when a
schedule *starts*; they need the matching *end date* so the series stops generating
meetups after the season, without having to remember to delete the schedule.

## Goals
- Each named schedule gets an optional **end date** (`schedule.endDate`).
- No meetup is **automatically generated** for a slot after the end date.
- The end date is **inclusive**: a slot on the end date itself is still generated. *(my call)*
- When an organizer saves an end date and the series already has regular meetups after it,
  they're asked: **"Delete meetups after Mar 15?"** → *Delete* or *Keep*. No count is shown (a series can have 100+ meetups; a number confuses more than it helps).
- Kept meetups stay part of the series (they keep following later edits to name, location,
  description, capacity, RSVP rules) and are never removed by later edits unless the
  organizer explicitly chooses Delete on a later save.

## Non-goals
- One-off meetups are unaffected — they can be created on any date.
- Individual meetups can be moved past the end date (they become overrides, as today).
- No "end after N occurrences" option.
- No automatic notification/announcement when a season ends.

## Anti-goals
- Never silently delete meetups people have RSVP'd to because of an end date.

## Decisions
1. **Data:** `namedScheduleSchema.endDate: { type: Date, default: null }`, stored as a date-only
   UTC midnight, exactly like `startDate`. `null` = runs forever (all existing schedules).
2. **Generation** (`computeScheduleCandidates`): compute `endBoundary` = end of the end date's
   day in the group timezone (same keepLocalTime conversion as `kickoffDate`). A slot whose
   date is after `endBoundary` is not a candidate; the window walk for that dayTime stops
   there. Applies to every frequency (daily … yearly, biweekly, ordinal, custom).
3. **No idle cron firing:** when every routine's next occurrence is past `endBoundary`,
   `nextGenerationAt` is set to `null` so the regen job stops picking the schedule up.
   Clearing or extending the end date regenerates as normal on save (update already calls
   generation).
4. **Cleanup rule (approach A):** `reconcileScheduleMeetups(group, schedule, { removeAfterEnd })`
   never deletes regular series meetups dated after the end date **unless** `removeAfterEnd`
   is true. Slots before/on the end date reconcile exactly as today. `resetAll` (timezone
   change) keeps its current behavior. Hand-edited (override) and cancelled meetups are never
   deleted — unchanged.
5. **API:**
   - `POST/PUT /api/groups/:groupId/schedules[/:scheduleId]` accept `endDate` (ISO date or
     `null` to clear) and, on update, `removeAfterEnd: boolean` (default false).
     `endDate === undefined` leaves the stored value alone (old app builds never send it, so
     they can't clear it or trigger deletion).
   - Validation: `endDate` must be on/after the schedule start date (`startDate`, or for
     biweekly / quarterly / semiannual / yearly the earliest row first-date) → 400 with a
     readable message.
   - New `GET /api/groups/:groupId/schedules/:scheduleId/meetups-after?date=YYYY-MM-DD` →
     `{ count }`: this schedule's regular (non-override), scheduled meetups dated after that
     day in the group timezone. Managers only.
   - Group creation (`group.controller.js` ~line 82) accepts `endDate` alongside `startDate`.
6. **Mobile — picker:** in `RecurrenceEditor`, an **"Ending (optional)"** `DateField` under
   "Starting", shown for **all** frequencies (the Starting field stays hidden for biweekly /
   long-interval as today). Range: min = start date (or today), max = today + 2 years
   *(my call; the start picker's 4-month cap is too short for a season)*. `DateField` gains
   an optional `onClear` that renders a small "No end date" link. Lives in both the
   create-group flow and the edit-schedule screen since both use `RecurrenceEditor`.
   Drafts (`createGroupDraft`, `editScheduleDraft`, `scheduleRoutines`) carry
   `endDate: string | null`; the client-side issue check mirrors the server validation.
7. **Mobile — prompt:** on save in `app/group-edit-schedule/[id].tsx`, if `endDate` is set and
   differs from the saved value, call `meetups-after`. If `count > 0`, show
   `Alert.alert("Delete meetups after Mar 15?", "Some meetups are already on the calendar after
   this date. Delete them, or keep them?", [Cancel, Keep, Delete (destructive)])` — no count in the copy. Cancel aborts the save. The answer goes out as
   `removeAfterEnd`. If the count call fails, save with `removeAfterEnd: false` (safe default).
   New schedules never prompt.
8. **Display:** `recurrenceSummary` appends " · until Mar 15"; `ReviewScreen` shows
   "Ends Mar 15" beside "Starts …"; the schedule details modal shows it too.
9. **Change notifications:** `changeSummary.js` mentions an added/changed/removed end date
   ("Now ends Mar 15") like it does other schedule changes. That "Ends" notice is the only
   notification when the organizer chooses Delete — no per-meetup cancellation notices
   (owner's decision, 2026-11-20).

## Approaches considered
- **A (picked):** cleanup skips post-end meetups unless the save says delete. Kept meetups
  stay true series members and keep following series edits.
- **B (rejected):** convert kept meetups to overrides. Less backend code, but they'd stop
  following series edits and be mislabeled as hand-edited.

## Left to the builder
- Exact copy/styling of the "No end date" link and summary text.
- Whether `meetups-after` lives in `group.controller.js` or a schedule-specific controller
  (follow wherever the schedule routes already are).
