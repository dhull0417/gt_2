# Meetups tab: current groups only — implementation plan

**Goal:** `GET /api/meetups` returns only meetups from groups the user currently belongs to.
**Architecture:** In `getMeetups`, look up the ids of groups whose `members` contain the user and add `group: { $in: ids }` to the shared `memberFilter`, used by the full fetch, the delta `changed` query and `validIds`. No data is mutated, so rejoining restores visibility.
**Tech stack:** Express + Mongoose, `node --test` with module mocks (backend/).
**Spec:** docs/specs/2026-11-25-meetups-tab-current-groups-only-design.md

**Global constraints**
- Do not modify meetups, attendance records or stats on leave/remove.
- `evaluateDueMeetups` call is unchanged.
- No mobile changes.

**Review focus**
1. Delta sync: `validIds` must exclude the left group's meetups, or the client keeps them cached → Task 1 test "delta sync drops left group from validIds".
2. Cancelled + past meetups of a left group are excluded (not just upcoming) → Task 1 test "full fetch hides past and cancelled meetups of a left group".
3. Rejoin restores them → Task 1 test "rejoining shows the past meetups again".
4. Deleted group → its meetups absent → Task 1 test "deleted group's meetups are gone".

## File map
- Modify `backend/src/controllers/meetup.controller.js` — `getMeetups` filter.
- Create `backend/src/controllers/meetupsFeed.handlers.test.mjs` — handler tests (same stub style as `pastMeetups.handlers.test.mjs`).

## Task 1: Filter `getMeetups` by current group membership
**Files:** modify `backend/src/controllers/meetup.controller.js`; create `backend/src/controllers/meetupsFeed.handlers.test.mjs`.
**Interfaces:** consumes `Group.find({ members: userId }).distinct('_id')`; produces the same response shapes as today (array; or `{ changed, validIds, syncedAt }`).

- [x] Write failing tests in `meetupsFeed.handlers.test.mjs`, with an in-memory stub of `Meetup.find` / `Group.find` that honors `members` and `group.$in`. User Ana is in group A, used to be in group B. Meetups: A-upcoming, B-past (ended 2 days ago), B-cancelled, all listing Ana in `members`.
  - "full fetch hides past and cancelled meetups of a left group" → response ids === [A-upcoming].
  - "delta sync drops left group from validIds" → `validIds` === [A-upcoming], `changed` has no B meetups.
  - "rejoining shows the past meetups again" → add Ana to B's members → ids include B-past and B-cancelled.
  - "deleted group's meetups are gone" → remove group B and its meetups → ids === [A-upcoming].
- [x] Run `npm test` in backend/ → expect the first two (and rejoin baseline) to FAIL: B meetups present.
- [x] Implement in `getMeetups`: `const groupIds = await Group.find({ members: user._id }).distinct('_id'); const memberFilter = { members: user._id, group: { $in: groupIds } };`, importing `Group` if needed.
- [x] Run → all four PASS.
- [x] Run the full backend suite (`npm test`) → all pass.
- [x] ~~Commit~~ — skipped: user said not to commit; changes left uncommitted on `staging`.
