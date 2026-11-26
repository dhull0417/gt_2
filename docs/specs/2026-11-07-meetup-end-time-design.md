# Optional meetup end time — design

_2026-11-07. Size: medium project (backend + app, one release: 1.4.x on `staging`)._

## Intent
Meetups only have a start time, and the app quietly assumes every meetup lasts one hour. Organizers want to say "5:00 PM – 8:00 PM". An optional end time lets them, and makes "Happening Now", expiry and calendar events match reality.

## Goals
1. An optional end time can be set wherever a meetup start time is set: create-group schedule step, edit schedule, add a schedule to a group, the one-off meetup wizard, and the edit-meetup form inside the meetup sheet.
2. Stored on schedule rows (group schema) and on each meetup (meetup schema).
3. Shown as a range ("5:00 PM – 8:00 PM") on the meetup card and everywhere else the app shows a meetup's/schedule row's start time.
4. Meetup sheet header becomes three rows: date / time (range) / address.
5. When a meetup has an end time it replaces the 1-hour assumption for: "Happening Now", "Past"/read-only, the server's expiry job, Add to Calendar, ICS feeds. Without one, the 1 hour stays.

## Non-goals
- Push and email wording (no push/email shows the time today except the 30-minute reminder, which stays start-only). _Your decision._
- Moving the start doesn't move the end (no "duration follows start"). _Accepted trade-off of approach A._
- RSVP-window settings screen (`group-edit-jit`) — its pickers are RSVP open/close times, not meetup times.
- No backfill: existing meetups and schedules have no end time.

## Anti-goals
- No new native packages (1.4 stays buildable as-is).
- Old 1.3.x apps must keep working and must not erase end times they don't know about.

## Decisions
**Yours**
- End time is optional, replaces the 1-hour assumption when set.
- End earlier than start = next day (9:00 PM – 1:00 AM is 4 hours). End equal to start is rejected.
- The end-time field is always visible under the start time, labelled **"End Time (Opt.)"**, showing "None" when empty.
- Push/email wording unchanged; 30-minute reminder unchanged.
- Approach A (below).

**Mine**
- Each day/time row stores its own end time (a schedule can have different times on different days). Daily "same time every day" has one shared end time.
- A set end time shows a small ✕ to clear it. Opening the picker with no end time starts it at start + 1 hour.
- Changing only a meetup's end time counts as a "date and time" change, so the existing "Meetup Updated" push fires.
- Series edits update each kept meetup with its own row's end time; RSVPs are kept. Override (individually edited) meetups keep their own end time, like they keep their own start time.
- Legacy clients: when a 1.3.x app saves a schedule, any incoming row with no `endTime` field copies the end time from the existing row with the same frequency, day/date and start time.
- The range is also shown in: Group Details schedule lines and its "next meetup" line, the create-group Review screen, and collapsed routine summaries in the schedule editors. The card shows the range as plain times (no "+1 day" marker).
- Validation messages: "End time can't be the same as the start time." Client blocks it too.

## Approaches considered
- **A. Clock-time `endTime` + computed `endsAt` on meetups (picked).** Same format as `time`; server computes the exact end moment; expiry is one query; app and server share one rule.
- B. Duration in minutes — unambiguous rollover, end follows start, but conversions everywhere and possibly surprising.
- C. Clock time only — smallest schema change, but expiry/ICS compute per meetup and app/server can drift.

## Design (approach A)
### Data
- `group.model.js` `dayTimeSchema`: `endTime: { type: String, default: null }` ("08:00 PM").
- `meetup.model.js`: `endTime: { type: String, default: null }`, `endsAt: { type: Date, default: null }`.
- All additive; old documents read as `null`.

### The one rule
- `endsAt` = the end clock time on the start's calendar day in the meetup's timezone; if that is not after `startsAt`, add one day.
- Effective end = `endsAt ?? startsAt + 1 hour`. Backend helper and a mobile mirror (`meetupEndInstant`) implement the same thing.

### Backend
- `utils/date.utils.js`: `computeEndsAt(startsAt, time, endTime, timezone)`, `effectiveEnd(meetup)`, `isValidEndTime(time, endTime)`.
- Generation (`meetupGeneration.js`): copy `dtEntry.endTime`, compute `endsAt`.
- Reconcile: keep the slot key as date + start time; kept non-override meetups get `endTime`/`endsAt` from their own row (bulk write per slot).
- `createOneOffMeetup` accepts `endTime`; `updateMeetup` accepts `endTime` (`null` clears, absent = unchanged) and recomputes `endsAt` whenever date, time or end time changes.
- Schedule create/update and group create validate each row's `endTime`; legacy preservation as above (uses existing `isLegacyClient`).
- Expiry job: expire `scheduled` meetups where `endsAt <= now`, or `endsAt` is null and `startsAt <= now − 1 hour`.
- ICS (`calendar.controller.js`): `DTEND` = effective end.

### App
- Types (`utils/api.ts`): `DayTime.endTime?`, `Meetup.endTime?`, `Meetup.endsAt?`, one-off and update payloads.
- `utils/timeString.ts` (or `meetupTime.ts`): `formatTimeRange(time, endTime)` → "5:00 PM – 8:00 PM" / "5:00 PM".
- `utils/meetupTime.ts`: `meetupEndInstant(m)`; `meetupStatus.ts` uses it.
- Drafts (`createGroupDraft.ts`, `editScheduleDraft.ts`, `scheduleRoutines.ts`): `endTime: string | null` (+ `showEndTimePicker`) on every row type and `dailySharedEndTime`; `buildRoutines` sends `endTime` only when set; edit draft loads it.
- New shared `components/EndTimeField.tsx` (label, value/"None", ✕, picker toggle) used under every start-time field in `ScheduleScreen`, `group-edit-schedule/[id]`, `AddMeetupWizard`, and the edit form in `MeetupDetailModal`.
- `MeetupCard`, `MeetupDetailModal` header (three rows), `GroupDetailsView`, `ReviewScreen`, routine summaries use `formatTimeRange`.
- Add to Calendar: `endDate` = effective end.

## Rollout
Backend changes are additive and safe to deploy before the app. Old apps ignore the new fields and keep the 1-hour behaviour on their own screens. No feature flag.

## Left to the builder
Exact layout/spacing of `EndTimeField` within each screen's existing row style; test file placement following existing patterns.
