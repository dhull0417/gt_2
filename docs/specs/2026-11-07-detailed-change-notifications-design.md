# Detailed "meetup / schedule changed" notifications — design

_2026-11-07. Size: small-to-medium change (one backend helper + two call sites, one new notification type, one app renderer)._

## Intent
When an organizer changes a meetup, members get "The date and time for X changed. Tap to see what's new." They have to open the app to learn *what* it is now. The notification itself should say what changed and the new value, for both the push and the in-app notification. Whole-schedule edits currently notify no one; they should too.

## Goals
1. **Single-meetup edit** (`PATCH` meetup, `updateMeetup`): push + in-app list only the fields that actually changed, each with its new value. Fields: date/time (incl. end time when set), location, spot limit, description (description is new — today it sends nothing).
2. **Whole-schedule edit** (`updateSchedule`): one notification to the group (not one per meetup), listing only what actually changed, with new values. Fields: days and times, location, spot limit, description, minimum headcount, RSVP open time, RSVP close time, schedule name.
3. A save that changes none of those fields sends nothing.
4. Push wording is built on the server, so 1.3.x apps get the detailed push too.

## Non-goals
- Showing old values ("moved from Tue to Thu"). New values only. _Your decision._
- Notifying about priority tiers, RSVP questions, things to bring / rides. _Your decision._
- Changing who receives the notification or how muting works (beyond registering the new type).
- Changing schedule create/remove notifications.

## Anti-goals
- Reporting a field as changed when it wasn't (the schedule editor sends every field on every save, so compare values, never "was it in the request").
- Push and in-app wording drifting apart.
- One notification per meetup for a series edit (spam).

## Approach (picked)
A pure backend helper writes the change list once; the push body is built from it and the same list is stored on the in-app notification for the app to display. Rejected: storing raw values and formatting in the app (two formatters, old apps show nothing new).

## Decisions
**Yours**
- Both single-meetup and schedule edits notify; only changed fields are included, with new values.
- Field lists above, including what's left out.

**Mine (accepted with "sounds good")**
- New values only; description truncated to ~80 chars in the push and ~200 in-app.
- No-op saves send nothing. Old apps get the detailed push; their in-app list shows the generic line for the new schedule type.
- Muting treats these as the same "changes" kind as today.

**Mine (detail, settled while writing — say if any is wrong)**
- **Format.** One line per change, `Label: value`, in this order:
  - Meetup: When, Location, Spots, Description.
  - Schedule: Name, When, Location, Spots, Minimum, RSVPs open, RSVPs close, Description.
- **Push title.**
  - Meetup: `Meetup Updated: <name>` (unchanged).
  - Schedule: `Schedule Updated: <new schedule name> (<group name>)`. The body is just the change lines.
- **Values.**
  - Meetup When: `Thu, Nov 13 at 7:00 PM`, or `Thu, Nov 13, 7:00 – 9:00 PM` with an end time. The year is added when it isn't the current year. Always in the group's timezone.
  - Schedule When, one entry per day/time row:
    - Weekly: `Tuesdays at 6:00 PM`
    - Every 2 weeks: `Every other Tuesday at 6:00 PM`
    - Daily: `Every day at 6:00 PM`
    - Monthly by date: `Monthly on the 15th at 6:00 PM`
    - Monthly by ordinal: `2nd Wednesday of the month at 6:00 PM`
    - End times show as a range. Entries are joined with ", ". More than 3 entries show as the first 3 plus "+N more".
  - A group timezone change made from the schedule editor counts as a When change, and the When line then ends with the zone, e.g. `(Eastern Time)`.
  - Location: the new text, or `Removed`.
  - Spots: `12`, or `No limit` for 0.
  - Description: the new text (truncated), or `Removed`.
  - Minimum: `6 people`, or `Off` for 0.
  - RSVPs open: `2 days before at 9:00 AM`, or `Anytime` when not gated.
  - RSVPs close: `1 day before at 5:00 PM`, or `No deadline`.
  - Name: the new name.
- **Recipients.** Meetup edits go to the meetup's members (as today). Schedule edits go to the group's members. The editor is excluded, as `notifyAndPersist` already does.
- **Stored on the notification.**
  - `meta.changes = [{ field, label, value }]`, where `value` carries the longer in-app text (up to 200 chars).
  - `meta.changedFields` is still written for old apps.
  - The schedule notification also stores `meta.scheduleName`.
- **New type `schedule-updated`.**
  - Added to the notification enum and to the "changes" mute kind (`groupMute`).
  - It falls under the same app-wide notification preference as `meetup-updated`, and gets an app icon and routing.
  - Tapping it opens the group details. Tapping a meetup update still opens the meetup.
- **In-app rendering.**
  - Meetup: "**Sam** updated **Basketball**:", followed by one line per change.
  - Schedule: "**Sam** updated the **Basketball** schedule in **Hoops Crew**:", followed by one line per change.
  - Older notifications without `meta.changes` keep today's rendering.
- **Series edits.** A schedule edit that also updates individual meetups in place sends only the one schedule notification, never per-meetup ones.

## Constraints
- Depends on in-progress work in the same tree (uncommitted): meetup end time (`endTime` on meetups and day/time rows) and per-type group mute (`utils/groupMute.js`). Use those fields/kinds; if end time isn't present, the time shows start only.
- Backend tests: `node --test` (`npm test` in `backend/`). Mobile: `tsc --noEmit` + jest for any pure util.
- No new packages. Luxon is already a backend dependency.

## Left to the builder
- Exact file names for the helper and its tests; exact app styling of the change lines (secondary text color, matching existing notification rows).
