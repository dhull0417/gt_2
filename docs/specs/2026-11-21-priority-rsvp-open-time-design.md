# Set the RSVP open time from the Priority RSVP screen — design

Size: small change (one screen, one endpoint, one sync fix).

## Intent
Organizers setting up priority groups should set when RSVPs open on the same screen, instead of
leaving for the series' RSVP rules and coming back. "Open time" keeps its current meaning: the
series' earliest time to RSVP (`generationLeadDays` + `generationLeadTime`), which is when Group 1
gets its turn. Look and feel can be tuned later.

## Goals
- An "RSVPs open" card on the Priority RSVP screen: days before (stepper) + time, same controls
  and rules as the RSVP rules sheet ("Earliest time to RSVP").
- One Save writes the open time and the priority setup together, and upcoming meetups are
  recalculated once.
- A series with no open time no longer blocks the screen; setting one here turns on the RSVP window.
- Going back to the series edit screen shows the new open time, and its Save can't put the old one back.

## Non-goals
- No change to how the cascade works (Group 1 at the open time, groups follow, everyone else last).
- No change to the latest RSVP time (deadline) here; it is only used as a limit.
- No redesign of the screen.

## Approach (picked: A)
Extend `PUT /api/groups/:groupId/schedules/:scheduleId/priority` to also accept the open time.
Rejected: two saves from the screen (not atomic, heavier endpoint); moving priority into the
series edit form (too big).

## Decisions
- **Card placement (my call):** top of the screen, under the Priority RSVP switch, shown only while
  the switch is on. Hint: "Group 1 can start RSVPing at this time."
- **No on/off for the open time on this screen (my call):** priority needs one. If the series has
  none, the card starts at 1 day before, 9:00 AM (the server's defaults).
- **Limits:** the open time can't be after the series' latest RSVP time; reuse `stepLead` /
  `setLeadTime` from `mobile/utils/rsvpRules.ts` (same alert as the sheet).
- **Starting value:** if the edit screen has an unsaved open time / deadline, it passes them as route
  params and the card starts from those; otherwise from the saved series.
- **API:** body gains optional `openDays` (integer 0–365, my call) and `openTime` ("h:mm AM").
  Sent only when `enabled` is true. Missing → unchanged behaviour (older app builds). The server
  checks open ≤ deadline (same day → time compare) and returns 400 otherwise. The existing
  "Set when RSVPs open…" 400 stays for requests without `openDays` on a series with no open time.
- **Turning priority off** sends only `{ enabled: false }`; the open time is left as is.
- **Notification (my call):** if the open time actually changed, send the same "Schedule Updated"
  notification the regular series save sends (built with `scheduleSnapshot` / `scheduleChanges`),
  so members hear about it either way. Priority-only changes still send nothing, as today.
- **Edit screen sync:** when the edit screen regains focus and the saved series' open time differs
  from its baseline, it adopts the saved value into both the draft and the baseline
  (`rsvpRestricted: true, leadEnabled: true`). Done in a pure helper in `editScheduleDraft.ts`
  so it's unit-tested.

## Left to the builder
Exact copy, spacing, and whether `Stepper` / `TimeField` are exported from
`components/schedule/sheets.tsx` or moved to a shared file.
