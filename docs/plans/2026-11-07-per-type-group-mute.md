# Per-type group mute — implementation plan

_Status 2026-11-07: tasks 1–7 done in the working tree, uncommitted (the owner commits and pushes)._

**Goal:** members can mute chosen kinds of notifications per group from one shared mute sheet.
**Architecture:** a new `User.groupMutes` list is the source of truth for new-app mutes; the server keeps the legacy
`mutedGroups`/`mutedUntilNextMeetup` lists in sync for full mutes. One pure helper (`utils/groupMute.js`)
decides every group push. The mobile app gets one `GroupMuteSheet` used by the chat bell and the Groups swipe.
**Tech stack:** Express + Mongoose (backend, `node --test`), Expo/React Native + TanStack Query (mobile, jest).
**Spec:** `docs/specs/2026-11-07-per-type-group-mute-design.md`

## Global constraints
- Kind keys, exactly: `chat, rsvps, changes, cancellations, reminders, polls, groupUpdates` (this order in the UI).
- Labels: Chat messages, Who's coming, Meetup changes, Cancellations, Reminders, Polls, Group updates.
- Durations on the wire stay `'indefinite' | 'untilNext' | 'none'`; stored `until` is `'indefinite' | 'nextMeetup'`.
- `PATCH /api/users/mute-group` without `mutedTypes` = all 7 kinds (old apps, I'm Out + mute).
- No change to in-app notification records, to Settings › Notifications, or to the never-muted types.
- All new UI uses `useThemeColors()` and works in light and dark.
- Run `npm test` in `backend/` and `npx tsc --noEmit` + `npx jest` in `mobile/` after every task.

## Review focus
1. Old-app full mute (legacy list only) must still silence chat and reminders regardless of the flag → test in Task 1.
2. A partial mute must never leave the group id in a legacy list → test in Task 2.
3. @mention to a member whose group mute includes `chat` still pushes; app-wide chat off still blocks → test in Task 3.
4. Expire job clears `nextMeetup` entries but not `indefinite` ones → test in Task 4.
5. `mutedTypes: []` with a duration behaves as `none` → test in Task 2.

## File map
| File | Change |
|---|---|
| `backend/src/utils/groupMute.js` (+ `.test.mjs`) | new: `MUTE_KINDS`, `KIND_FOR_TYPE`, `kindOf`, `isMutedFor`, `applyMuteChange` |
| `backend/src/models/user.model.js` | add `groupMutes` |
| `backend/src/controllers/user.controller.js` | `toggleGroupMute` uses `applyMuteChange` |
| `backend/src/utils/push.notifications.js` | `notifyAndPersist` uses `isMutedFor`; drop `MUTE_EXEMPT`/`isGroupMuted` use there |
| `backend/src/utils/chatPush.js` (+ test) | `pickRecipients` uses `isMutedFor` |
| `backend/src/routes/group.route.js`, `routes/chat.route.js` | chat + reaction pushes use helper; select `groupMutes` |
| `backend/src/controllers/job.controller.js` | reminder jobs filter via helper; expire job clears `nextMeetup` entries |
| `backend/src/controllers/group.controller.js` | remove/leave/delete also pull `groupMutes` entry |
| `mobile/utils/groupMute.ts` (+ `__tests__/groupMute.test.ts`) | new: kinds, `muteStateFor` |
| `mobile/utils/api.ts` | `GroupMute` type, `User.groupMutes`, `toggleGroupMute(..., mutedTypes?)` |
| `mobile/components/GroupMuteSheet.tsx` | new shared sheet |
| `mobile/app/group-chat/[id].tsx` | use sheet + four-state bell; remove inline modal |
| `mobile/app/(tabs)/groups/index.tsx` | swipe opens sheet; partial icon |

## Task 1 — Mute kinds and the delivery rule (backend)
**Files:** create `backend/src/utils/groupMute.js`, `backend/src/utils/groupMute.test.mjs`.
**Produces:** `MUTE_KINDS: string[]`; `kindOf(pushType): string|null`; `isMutedFor(user, groupId, pushType, { aboutNextMeetup = false, muteAll = flags.muteAllPushes() } = {}): boolean`.
- [x] Tests: every type in the spec table maps to its kind; never-muted types and unknown types → `null` and never muted;
  entry with `mutedTypes:['chat']` mutes `chat`, not `meetup-cancelled`, regardless of `muteAll`;
  legacy-only (`mutedGroups` contains id, no entry): `chat` and `meetup-starting-soon` muted with `muteAll:false`;
  `meetup-updated` muted only when `aboutNextMeetup` or `muteAll`; same for `mutedUntilNextMeetup`; no mute → false;
  string vs ObjectId ids compare equal.
- [x] Run `node --test src/utils/groupMute.test.mjs` → FAIL (module not found).
- [x] Implement per spec "Delivery rule". `chat-reaction` pushes use type `chat`.
- [x] Run → PASS; full `npm test` passes.
- [x] Commit (left to the owner, per request) "Add per-type group mute rule".

## Task 2 — Storing a mute (backend)
**Files:** `groupMute.js`/test (add), `models/user.model.js`, `controllers/user.controller.js`.
**Produces:** `applyMuteChange(user, groupId, muteType, mutedTypes?)` → mutates plain `user` fields (`groupMutes`, `mutedGroups`, `mutedUntilNextMeetup`), throws `Error` with `.status = 400` on unknown kinds.
- [x] Tests: no `mutedTypes` + `untilNext` → entry `{until:'nextMeetup', mutedTypes: all 7}` and id in `mutedUntilNextMeetup` only;
  `indefinite` + `['chat','polls']` → entry, id in neither legacy list; switching full→partial removes legacy id;
  `none` → no entry, no legacy ids; `[]` + duration → same as `none`; `['bogus']` → throws status 400; duplicate kinds de-duplicated;
  re-applying replaces the existing entry (one entry per group).
- [x] Run → FAIL. Implement; add schema field `groupMutes: [{ group: ObjectId ref Group, until: { type: String, enum: ['indefinite','nextMeetup'] }, mutedTypes: [String], updatedAt: Date }]`, default `[]`.
- [x] `toggleGroupMute` reads `mutedTypes` from body, calls `applyMuteChange`, maps thrown 400, responds `{ muted, muteType, groupMutes, message }`.
- [x] Run → PASS; `npm test`. Commit (left to the owner, per request) "Store per-type group mutes".

## Task 3 — Use the rule for every push (backend)
**Files:** `utils/push.notifications.js`, `utils/chatPush.js` + test, `routes/chat.route.js`, `routes/group.route.js`, `controllers/job.controller.js`.
- [x] Tests in `chatPush.test.mjs`: member with entry `mutedTypes:['rsvps']` gets a normal chat push; with `['chat']` gets none unless mentioned;
  mentioned + `notificationPrefs.chat === false` → none.
- [x] Run → FAIL. Implement: `pickRecipients` uses `isMutedFor(u, groupId, 'chat')`; `chat.route.js` selects `groupMutes`.
- [x] `notifyAndPersist`: when `group` is set, filter with `isMutedFor(user, group, type, { aboutNextMeetup })`, computing
  `aboutNextMeetup` via existing `isNextUpcomingMeetup` only when `meetup` is set and the flag is off.
- [x] `group.route.js` last-message (type `chat`) and reaction push: drop the `mutedGroups`/`mutedUntilNextMeetup` `$ne` filters, filter results with the helper.
- [x] `job.controller.js` 30-minute and RSVP-reminder jobs: same change.
- [x] Run `npm test` → PASS. Commit (left to the owner, per request) "Route all group pushes through the mute rule".

## Task 4 — Clearing mutes (backend)
**Files:** `controllers/job.controller.js`, `controllers/group.controller.js`, `groupMute.js`/test.
**Produces:** `clearNextMeetupMutesUpdate(groupIds)` → the Mongo `{ filter, update }` pair used by the expire job.
- [x] Test: filter matches `groupMutes` entries with `until:'nextMeetup'` for those groups; update `$pull`s only those (`indefinite` untouched) and still pulls legacy `mutedUntilNextMeetup`.
- [x] Run → FAIL. Implement and use in the expire job.
- [x] Remove member / leave / delete group: add `groupMutes: { group: <id> }` to the existing `$pull`s (and `mutedGroups`/`mutedUntilNextMeetup` where missing).
- [x] Run `npm test` → PASS. Commit (left to the owner, per request) "Clear group mutes on expiry and leave".

## Task 5 — Mobile mute state
**Files:** create `mobile/utils/groupMute.ts`, `mobile/utils/__tests__/groupMute.test.ts`; modify `mobile/utils/api.ts`.
**Produces:** `MUTE_KINDS: { key: MuteKind; label: string; icon: FeatherName }[]`; `type MuteKind`; `muteStateFor(user, groupId): { state: 'none'|'partial'|'full'; until: 'indefinite'|'nextMeetup'|null; mutedTypes: MuteKind[] }`;
`userApi.toggleGroupMute(api, groupId, muteType, mutedTypes?)` returning `{ muted: boolean; groupMutes?: GroupMute[] }`.
- [x] Tests: no data → none; entry with 7 kinds → full + its until; 2 kinds → partial; legacy `mutedGroups` only → full/indefinite with all kinds; legacy `mutedUntilNextMeetup` only → full/nextMeetup; entry wins over legacy.
- [x] Run `npx jest utils/__tests__/groupMute.test.ts` → FAIL. Implement. → PASS. `tsc` clean.
- [x] Commit (left to the owner, per request) "Add mobile group mute state".

## Task 6 — Shared mute sheet
**Files:** create `mobile/components/GroupMuteSheet.tsx`.
**Interface:** `<GroupMuteSheet visible group={{ _id, name, isDM }} currentUser onClose />`. Owns the save: optimistic update of `['currentUser']` (`groupMutes` + legacy lists, same as server), calls `toggleGroupMute`, toast with Undo (restores previous state), rollback + error toast on failure.
- [x] Build per spec "Mobile": moves the chat modal's look (option rows, chips, colours) here; `ToggleSwitch` rows from `MUTE_KINDS` (Chat only when `isDM`); duration buttons disabled when no switch on; current duration marked and "Unmute all" when muted.
- [x] `tsc` clean. Commit (left to the owner, per request) "Add shared group mute sheet".

## Task 7 — Wire up chat bell and Groups swipe
**Files:** `mobile/app/group-chat/[id].tsx`, `mobile/app/(tabs)/groups/index.tsx`.
- [x] Chat: bell always opens `GroupMuteSheet`; icon from `muteStateFor` (none/full/full-until-next as today; partial = `bell` + small amber dot); delete the inline mute modal, `performMuteUpdate`, `handleMuteOptionPress` and unused mute styles.
- [x] Groups: swipe Mute/Unmute opens the same sheet (remove `Alert.alert` and `applyMute`); muted icon shown for full and partial (partial uses `textFaint` colour); swipe label "Muted" when any mute.
- [x] `tsc` clean; full mobile jest passes. Commit (left to the owner, per request) "Use the shared mute sheet in chat and Groups".

## Task 8 — Final check
- [x] Reread spec line by line; tick each item.
- [x] Backend `npm test`, mobile `tsc` + jest all pass.
- [x] Fresh-reviewer pass over the diff against the spec.
- [ ] Device checklist (for you): spec "Testing › Device".

### Review outcome (2026-11-07)
Fresh reviewer: no high-severity issues. Fixed: Undo on "I'm Out + mute" now restores the previous mute
(`restoreRequest`); the sheet cancels in-flight `currentUser` refetches before its optimistic update; the
sheet picks up user data that loads while it's open (unless the member already changed a switch); the
Groups-list sheet keeps its group during the fade-out; `scripts/backfill.js` also clears `nextMeetup` entries.
Backend 178/178 pass; mobile groupMute jest 7/7; `tsc` clean for this feature (the only errors are in
MeetupDetailModal from the in-progress end-time work: missing `EndTimeField`, `headerTime`).

### Device checklist
1. Chat bell and Groups swipe open the same sheet (light and dark).
2. Mute only Chat indefinitely in group A: bell shows the partial look; Groups row shows the faint bell.
3. Another member posts in A: no push. They @mention you: push arrives.
4. Organizer cancels a meetup in A: push arrives. Organizer edits time: push arrives.
5. Reopen the sheet: Chat on, others off, "Mute" checked, "Unmute all" shown. Unmute all → bell green.
6. Mute everything until next meetup: bell-off + clock. After that meetup ends (expire job), unmuted.
7. Toast Undo restores the previous state each time; "I'm Out + mute" then Undo restores a partial chat mute.
8. In a DM, the sheet shows only Chat.
9. On a 1.3.x build with the same account: full mute from the new app shows as muted; partial shows unmuted;
   muting from the old app still silences chat on the new backend.
