# Detailed change notifications — implementation plan

**Goal:** Meetup and schedule edits notify members with only the changed fields and their new values (push + in-app).
**Architecture:** One pure helper (`backend/src/utils/changeSummary.js`) diffs before/after snapshots into `[{field,label,value}]`; the push body and `meta.changes` come from that one list. A field counts as changed only if its displayed text differs. The app renders `meta.changes`.
**Spec:** `docs/specs/2026-11-07-detailed-change-notifications-design.md`

**Global constraints:** push value truncation 80 chars, in-app 200; New values only; no-op saves send nothing; one notification per schedule edit; type `schedule-updated` is kind `changes` for mutes; old apps keep `meta.changedFields`.

**Review focus:** (1) schedule editor resends unchanged fields -> no false "changed"; (2) clearing location/description -> "Removed"; (3) capacity 0 -> "No limit"; (4) biweekly start-date-only change -> no notification; (5) editor excluded from recipients.

## Files
- Create `backend/src/utils/changeSummary.js`, `changeSummary.test.mjs`
- Modify `backend/src/controllers/meetup.controller.js` (updateMeetup), `group.controller.js` (updateSchedule), `models/notification.model.js` (enum), `utils/groupMute.js` + `groupMute.test.mjs`
- Modify `mobile/utils/api.ts`, `notificationIcons.ts`, `app/notifications.tsx`; create `mobile/utils/changeLines.ts` + test

## Tasks
- [x] **T1 helper** — `meetupChanges(before, after, {now})`, `scheduleChanges(before, after, {now})`, `pushBody(changes)`; tests first (fail: module missing), then implement.
- [x] **T2 updateMeetup** — snapshot before, use helper, new title/body/meta. Full backend suite.
- [x] **T3 updateSchedule + type** — snapshot, notify group after save, enum + mute kind (+ test table).
- [x] **T4 app** — types, icon, render `meta.changes` lines (fallback to old text), tests, `tsc`.
- [x] **T5 verify** — backend `npm test`, mobile `tsc` + jest, re-read spec.
