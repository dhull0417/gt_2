# Meetup form with Premium settings — design

Date: 2026-11-18. Size: project (mobile + backend, ~2 days).

## Intent
One-off meetups can't use any Premium features today, and no single meetup can have its own Premium settings.
Organizers want:
1. The **Add Meetup** screen to look like the **Set Recurring Meetups** screen (section cards + rainbow Premium card).
2. Premium settings that can be set **for one meetup only**: when creating a one-off, and later from **Edit Meetup**, for one-offs *and* for single meetups of a series.

## Goals
- One full-screen `MeetupForm` used for both Add Meetup and Edit Meetup, built from the same pieces as the schedule screen.
- Per-meetup settings: **RSVP Rules** (earliest/latest time to RSVP, "N days before at a time"), **Minimum to Meet**, **Things to bring**, **Rides**, **RSVP Questions**.
- A meetup of a series whose settings were changed individually keeps them; later series edits don't overwrite them.
- The server enforces every Premium rule, as it does for schedules.

## Non-goals
- Priority RSVP per meetup (stays a series setting; a series meetup keeps using the series' priority groups, now measured from that meetup's own RSVP window).
- Changing the recurring-schedule screens' behavior (they only gain shared components).
- A "reset to series settings" button (possible later).

## Anti-goals
- Two copies of the meetup form that drift apart.
- Silently wiping people's item claims, ride sign-ups or question answers beyond what series edits already do.

## Approaches considered
- **A. One shared form for create + edit (picked).** Extract RSVP Rules and Capacity cards from `create-group/ScheduleScreen.tsx`; reuse `PremiumFeaturesCard` and `MinimumToMeetField`. Biggest up-front change, but one UI for both screens.
- B. Restyle Add and bolt Premium onto the Edit popup separately: faster, but two forms and Edit still looks different.
- C. A separate "Meetup Premium" screen: least risk, doesn't deliver the requested look.

## Decisions

### Mobile
- **New `components/meetup-form/MeetupForm.tsx`** (full-screen Modal, pageSheet on iOS), props: `mode: 'create' | 'edit'`, initial values, `isPremium`, `owner`, `onSubmit(values)`. Layout, top to bottom:
  - Title ("Add Meetup" / "Edit Meetup") and subtitle, styled with `create-group/styles.ts` (`makeStyles`).
  - **Which group?** card (create mode with group picker only, as today, incl. New Group name/photo).
  - **Description** card, **Where** card (`LocationField` "wizard" variant), **When** card (inline month calendar as today in create; same calendar in edit, replacing the native date spinner; time, end time, timezone — timezone read-only in edit, since the server always uses the group's).
  - **RSVP Rules** card: extracted from `ScheduleScreen` into `components/schedule/RsvpRulesCard.tsx` (Allow anytime / Limit RSVPs, earliest/latest toggles with day steppers + time, the same cross-checks and alerts, then `MinimumToMeetField`). `ScheduleScreen` and `group-edit-schedule/[id].tsx` switch to it (my call: worth it to keep them identical; done as its own task so it can be reviewed alone).
  - **Capacity** card: extracted the same way into `components/schedule/CapacityCard.tsx`.
  - **Premium** card: `PremiumFeaturesCard`, collapsible, with things to bring, rides, and a link row **RSVP Questions**. In create mode the row says "Set up after the meetup is created" (as the create-group flow does); in edit mode it opens the questions screen for this meetup.
  - Footer: "Create Meetup" / "Save".
- `AddMeetupWizard.tsx` becomes a thin wrapper around `MeetupForm` (keeps its props, so `(tabs)/index.tsx` and `group-chat/[id].tsx` don't change).
- `MeetupDetailModal.tsx`: "Edit Meetup" opens `MeetupForm` in edit mode; the old inline edit modal and its state are removed.
- **Premium status** (my call): existing group → `group.isPremium` (owner's Premium, what the server checks); New Group → `usePremium().isPremium` (the creator becomes owner). Locked state and Get Premium button as on the schedule screens.
- **Questions screen** `app/group-questions/[id].tsx` accepts either `scheduleId` or `meetupId`; with `meetupId` it reads/writes that meetup's questions.
- Form state/validation lives in a pure module `utils/meetupFormDraft.ts` (draft from a meetup, draft → API payload, validation) with jest tests, following `editScheduleDraft.ts`.

### Backend
- **Meetup model** gains:
  - `rsvpLeadDays` (Number|null), `rsvpLeadTime` (String, "09:00 AM"), `rsvpDeadlineDays` (Number|null), `rsvpDeadlineTime` (String, "09:00 AM") — the meetup's own RSVP rules, used to compute `rsvpOpenDate`/`rsvpCloseDate` and recompute them on reschedule.
  - `customSettings` (Boolean, default false) — true once this meetup's RSVP rules, minimum, items, rides or questions were set on the meetup itself. Always true for one-offs created with any of these.
- **Shared helper** `utils/meetupSettings.js`: `parseMeetupSettings(body, meetup, group)` → validated patch or `{status, body}` error. Reuses `parseBringItems`, `withExistingIds` (against the meetup's current items so claims survive), `minHeadcountProblem`, `parseQuestions`, and the existing `*_PREMIUM_REQUIRED` responses via `groupHasPremium`. Also `computeRsvpWindow(startsAt, tz, rules)`. (`parseBringItems`/`withExistingIds` move from `group.controller.js` into a shared util.)
- **`POST /groups/:groupId/meetups`** (`createOneOffMeetup`) accepts `rsvpLeadDays/Time`, `rsvpDeadlineDays/Time`, `minAttendees`, `bringItems`, `ridesEnabled`. Sets rsvpOpenDate/CloseDate, `rsvpNotified`, `minimumChecked` like generation does. When creating in a brand-new group, Premium is the creator's (they are the owner) — same `groupHasPremium` check.
- **`PUT /meetups/:meetupId`** (`updateMeetup`) accepts the same fields (undefined = unchanged). Any of them present → `customSettings = true`. Reschedule recomputes the RSVP window from the meetup's own rules when `customSettings` (or one-off), otherwise from the series as today. Priority groups for a series meetup are resolved with the series' priority config and the meetup's own base open time. Removing an item drops its claims; turning rides off clears rides (same as series edits). Changing the latest RSVP time re-arms `minimumChecked`.
- **`PUT /meetups/:meetupId/questions`** (new): same validation/Premium gate as `updateScheduleQuestions`; keeps answers to questions that still exist; sets `customSettings`.
- **Series refreshes skip customized meetups**: `refreshOverrideMeetupWindows`, `refreshOverrideAssignments`, `refreshSeriesQuestions` and the in-place update in `reconcileScheduleMeetups` leave the settings fields of `customSettings: true` meetups alone (their date/location/etc. behave as today).
- `changeSummary` "what changed" notifications include the new fields where meaningful (minimum, RSVP times); items/rides/questions changes don't notify (my call, matches series edits).

## Ship order
Backend before the app build. An older app ignores the new fields; an older backend ignores them too (the meetup is created without Premium settings, no error).

## Left to the builder
- Exact copy for helper lines and the "customized" hint (if any) on series meetups.
- Whether `MeetupForm` keeps a single scroll or uses `automaticallyAdjustKeyboardInsets` like `ScheduleScreen` — match whichever works on Android in the existing wizard (KeyboardAvoidingView padding).
