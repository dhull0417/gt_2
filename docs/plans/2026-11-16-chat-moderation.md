# Chat moderation (mod deletes + timeouts) — implementation plan

**Goal:** Owners/moderators can delete any group-chat message and time members out of a group's chat.

**Architecture:** The backend checks roles in Mongo and is the only writer of timeouts (Mongo
`Group.chatTimeouts`, copied to Supabase `chat_timeouts`). Supabase refuses send/react/pin (and,
after lockdown, direct edits/deletes) from a timed-out person. The app hides actions, shows the red
timed-out input, and fails (does not retry) anything the database refuses as `timed out`.

**Tech stack:** Express + Mongoose (`node --test` with module mocks), Supabase Postgres (plpgsql),
Expo / React Native + React Query (jest-expo).

**Spec:** `docs/specs/2026-11-16-chat-moderation-design.md`

## Status (2026-11-16)
Tasks 1–11 built test-first. A fresh reviewer checked the whole change; its confirmed findings are fixed (see the spec, "After the fresh review"). Backend `npm test` 465/465 (run from a local copy). Mobile `tsc` clean (apart from asset files left out of the local copy) and jest 32 suites / 288 tests pass (local copy, jest-expo, with a local-only AsyncStorage mock). Deviations are listed in the spec under "Changes made while building". Nothing committed.

## Global constraints
- Duration keys, exactly: `5m 15m 30m 1h 2h 12h 1d 1w indefinite` → minutes `5, 15, 30, 60, 120, 720, 1440, 10080`, `indefinite` → `until: null`.
- Database error text for a refused action: exactly `timed out` (the app matches on it).
- Notification type: `chat-timeout`. Push body: `You've been timed out of the chat for 1 hour.` (label per key: `5 minutes, 15 minutes, 30 minutes, 1 hour, 2 hours, 12 hours, 1 day, 1 week`) or `You've been timed out of the chat until a moderator lifts it.` Title: group name.
- Input label: `You are timed out for N days|hours|minutes` (largest unit only; floor, except minutes ceil, min 1; singular at 1) or `You are timed out Indefinitely`. Red = `colors.danger`.
- Permission: delete = `canManageGroup`; timeout set/clear = `canManageMember` and target ≠ requester. Neither in DMs (`group.isDM`).
- `Group.chatTimeouts` is `select: false`; only code that needs it asks for `+chatTimeouts`.
- No git commits (owner commits). Backend tests run from a local copy if the OneDrive mount is slow.

## Review focus (each has a test in the named task)
1. Timeouts leaking to ordinary members through `getGroups` / `getGroupDetails` → Task 5.
2. Mod delete with a `messageId` from a different group than `:groupId` → Task 4 (404, nothing written).
3. A moderator timing out another moderator / the owner / themself → Task 4 (403/400).
4. Supabase write fails after the Mongo write → Task 4 (502, Mongo entry rolled back).
5. An expired timeout counts as none everywhere (backend `activeTimeout`, app label, SQL `until > now()`) → Tasks 2, 7, 1.

## File map
- Create `supabase/migrations/20261116000000_chat_moderation.sql` — table, `is_chat_timed_out`, checks in 3 functions.
- Create `supabase/tests/chat_moderation_check.sql` — self-checking script, run in a transaction that rolls back.
- Modify `_hold/supabase/20261020010000_chat_phase3_lockdown.sql` — timeout checks in policies + its `toggle_reaction`.
- Create `backend/src/utils/chatTimeout.js` (+ `.test.mjs`) — durations, `timeoutUntil`, `activeTimeout`, `pruneExpired`, `timeoutPushBody`.
- Modify `backend/src/utils/supabaseAdmin.js` (+ test) — `setChatTimeoutRow`, `deleteChatTimeoutRow`, `deleteGroupChatTimeouts`, `deleteUserChatTimeouts`, `getChatMessage`, `modDeleteChatMessage`.
- Modify `backend/src/models/group.model.js`, `backend/src/models/notification.model.js`.
- Create `backend/src/controllers/chatModeration.controller.js` (+ `chatModeration.handlers.test.mjs`); modify `backend/src/routes/chat.route.js`.
- Modify `backend/src/controllers/group.controller.js` (`getGroupDetails`, `deleteGroup`), `backend/src/controllers/user.controller.js` (account deletion).
- Create `mobile/utils/chatTimeout.ts` (+ `__tests__/chatTimeout.test.ts`).
- Modify `mobile/utils/api.ts`, create `mobile/hooks/useChatModeration.ts`.
- Modify `mobile/utils/chatMutations.ts` (+ test), `mobile/hooks/useMessages.ts`.
- Modify `mobile/components/ChatMessageInput.tsx`, `mobile/components/ChatActionPanel.tsx`; create `mobile/components/ChatTimeoutSheet.tsx`, `mobile/hooks/useNow.ts`.
- Modify `mobile/app/group-chat/[id].tsx`, `mobile/components/GroupDetailsView.tsx`, `mobile/components/GroupDetailsScreen.tsx`.
- Modify `mobile/utils/notificationIcons.ts`, `mobile/utils/notificationRouting.ts`, `mobile/app/_layout.tsx`.

---

### Task 1 — Supabase: timeouts table and enforcement
**Files:** create `supabase/migrations/20261116000000_chat_moderation.sql`, `supabase/tests/chat_moderation_check.sql`; modify `_hold/supabase/20261020010000_chat_phase3_lockdown.sql`.
**Produces:** table `public.chat_timeouts(group_id text, clerk_id text, until timestamptz null, created_at timestamptz default now(), pk(group_id, clerk_id))`, RLS on, policy "read own timeouts" (select, `clerk_id = auth.jwt()->>'sub'`); `public.is_chat_timed_out(p_group_id text) returns boolean` security definer, granted to `authenticated`.
- [x] Write `chat_moderation_check.sql`: `begin;` set `request.jwt.claims` to `{"sub":"t-user"}`; insert a group_members row and a message; insert timeout `until = now() + interval '1 hour'`; assert `is_chat_timed_out` true; assert `send_message`, `toggle_reaction`, `set_message_pinned` each raise `timed out` (DO blocks catching `others` and checking `SQLERRM`); set `until = now() - interval '1 minute'` → assert false and `send_message` succeeds; `until = null` → true; `rollback;`. Every failure `raise exception 'FAIL: …'`; ends `raise notice 'ALL PASS'`.
- [x] Expected before the migration: fails (`function is_chat_timed_out does not exist`). Owner runs it in the SQL editor (the connector cannot reach Chat-Practice); if a Postgres is available locally, run there against the earlier migrations first.
- [x] Write the migration: table + policy + function; re-create `send_message` (same 11-arg signature, adds `if public.is_chat_timed_out(p_group_id) then raise exception 'timed out'; end if;` after the auth check), `toggle_reaction` and `set_message_pinned` (check after loading the row, using `r.group_id`). Keep each function's current security mode and grants. Rollback notes at the bottom.
- [x] Migration + check script verified on a local Postgres 16 stand-in (`ALL PASS`, re-runnable, lockdown checks pass). **Owner still runs both on Chat-Practice.**
- [x] Lockdown file: add `and not public.is_chat_timed_out(group_id)` to "members send messages" (with check) and "authors edit own messages" (using and with check); add the timeout check to its `toggle_reaction` copy; add a header line requiring `20261116000000_chat_moderation.sql` first.

### Task 2 — Backend timeout helpers
**Files:** create `backend/src/utils/chatTimeout.js`, `backend/src/utils/chatTimeout.test.mjs`.
**Produces:** `TIMEOUT_DURATIONS` (`{ '5m': { minutes: 5, label: '5 minutes' }, … , indefinite: { minutes: null, label: null } }`); `timeoutUntil(key, now) → Date | null` (throws `RangeError` on unknown key); `activeTimeout(entries, userId, now) → { until: Date|null } | null`; `pruneExpired(entries, now) → entries`; `timeoutPushBody(key) → string`.
- [x] Tests: `timeoutUntil('1h', t)` = t+60 min; `'1w'` = t+10080 min; `'indefinite'` → null; `'2d'` throws. `activeTimeout`: entry with past `until` → null; `until: null` → `{ until: null }`; other user → null. `pruneExpired` keeps indefinite and future, drops past. Push body strings exactly as in Global constraints for `'1h'` and `'indefinite'`.
- [x] Run → FAIL (module not found). Implement. Run → PASS. Run full backend suite.

### Task 3 — Backend Supabase calls
**Files:** modify `backend/src/utils/supabaseAdmin.js`, `supabaseAdmin.test.mjs`.
**Produces (all take `{ env, fetchImpl }` like the existing ones):**
- `setChatTimeoutRow(groupId, clerkId, until)` — POST `/rest/v1/chat_timeouts?on_conflict=group_id,clerk_id`, `Prefer: resolution=merge-duplicates,return=minimal`, body `[{group_id, clerk_id, until: ISO|null}]`. **Throws** on failure (callers roll back) and returns `false` if not configured.
- `deleteChatTimeoutRow(groupId, clerkId)` — throws on failure.
- `deleteGroupChatTimeouts(groupId)`, `deleteUserChatTimeouts(clerkId)` — `safely` style (log, return bool).
- `getChatMessage(messageId) → { id, group_id, image_url, deleted_at } | null` — throws on failure.
- `modDeleteChatMessage(message)` — removes photo (if any) then PATCH `messages?id=eq.<id>` with `{ deleted_at, content: '', image_url: null, reply_to_content: null, mentions: [] }`; throws on failure.
- [x] Tests: each builds the right URL/method/body against a stub fetch; `setChatTimeoutRow` sends `until: null` for indefinite; a 500 from the stub makes `setChatTimeoutRow` reject; not-configured returns false without calling fetch.
- [x] FAIL → implement → PASS → full suite.

### Task 4 — Moderation routes
**Files:** modify `backend/src/models/group.model.js` (`chatTimeouts: { type: [{ user: ObjectId ref User, until: Date (default null), by: ObjectId ref User, createdAt: Date }], select: false, default: [] }`), `backend/src/models/notification.model.js` (add `'chat-timeout'` to the type enum); create `backend/src/controllers/chatModeration.controller.js`, `chatModeration.handlers.test.mjs`; modify `backend/src/routes/chat.route.js` (three routes with `protectRoute`).
**Produces:** `modDeleteMessage`, `setChatTimeout`, `clearChatTimeout` handlers; routes `DELETE /:groupId/messages/:messageId`, `PUT /:groupId/timeouts/:userId`, `DELETE /:groupId/timeouts/:userId`.
**Behavior:** 400 bad ids / unknown duration; 404 group/requester/target missing or target not a member; 400 DM; 403 permission; 400 self; 503 `{ error: 'Chat moderation is not set up.' }` when `isConfigured()` is false. Delete: 404 if message missing or `group_id !== groupId`; 200 without writing if already deleted; if `group.lastMessage` matches (same sender clerkId and createdAt within 1 s of the row's `created_at`), set `lastMessage.text = 'Message deleted'`. Set timeout: prune expired, replace the user's entry, save, then `setChatTimeoutRow`; on throw restore the previous array, save, respond 502 `{ error: 'Could not update the chat. Try again.' }`; on success `notifyAndPersist([target], { title: group.name, body: timeoutPushBody(key), data: { groupId, type: 'chat-timeout' }, type: 'chat-timeout', sender: requester._id, group: group._id })` (push failure logged, not fatal) and respond `{ userId, until }`. Clear: remove entry, `deleteChatTimeoutRow`, same rollback; 200 `{ userId, until: null }` even if there was none.
- [x] Handler tests (pattern of `rides.handlers.test.mjs`, mocking `supabaseAdmin.js` and push): owner times out mod → 200 + one push to the mod with `type 'chat-timeout'`; mod times out mod → 403; mod times out owner → 403; anyone times out self → 400; `duration: '2d'` → 400; DM group → 400; Supabase stub throws → 502 and `group.chatTimeouts` equals what it was before; re-timeout replaces (one entry); clear by mod on member → 200 and Supabase delete called; mod delete of message whose `group_id` differs → 404 and no PATCH; regular member delete → 403; delete of last message updates preview text; not configured → 503.
- [x] FAIL → implement → PASS → full suite.

### Task 5 — Expose timeouts; clean up on deletes
**Files:** modify `backend/src/controllers/group.controller.js` (`getGroupDetails`, `deleteGroup`), `backend/src/controllers/user.controller.js` (account deletion); test in `group.controller.test.mjs` (or a new `chatTimeoutExposure.handlers.test.mjs`).
**Produces:** `getGroupDetails` response gains `myChatTimeout: { until: string|null } | null` (always) and `chatTimeouts: [{ userId: string, until: string|null }]` (owner/mods only; key absent for others). `deleteGroup` calls `deleteGroupChatTimeouts`; account deletion calls `deleteUserChatTimeouts(clerkId)` and pulls the user's entries from groups they stay in `{ $pull: { chatTimeouts: { user } } }`.
- [x] Tests: member sees own active `myChatTimeout`, no `chatTimeouts` key; member with an expired entry gets `myChatTimeout: null`; moderator sees `chatTimeouts` with only active entries; the group objects returned by `getGroups` have no `chatTimeouts` (schema `select: false` check: `Group.schema.path('chatTimeouts').options.select === false`).
- [x] FAIL → implement (query with `.select('+chatTimeouts')` only in `getGroupDetails`, strip it from the spread object) → PASS → full suite.

### Task 6 — App timeout helpers
**Files:** create `mobile/utils/chatTimeout.ts`, `mobile/utils/__tests__/chatTimeout.test.ts`.
**Produces:** `TIMEOUT_OPTIONS: { key: TimeoutKey; label: string }[]` (9, in order, last label `Indefinitely`); `isTimeoutActive(t: { until: string|null } | null | undefined, now: number): boolean`; `formatTimeoutRemaining(until: string|null, now: number): string`; `formatTimeoutEnd(until: string|null, now: Date): string` (`Indefinitely` / `until 3:15 PM` / `until Tue 3:15 PM` / `until Nov 30`); `isTimedOutError(err: unknown): boolean` (true when `message` contains `timed out`); `canTimeOut(me, target, group): boolean` (mirror of `canManageMember`, false for self/DM).
- [x] Tests: 3 days 2 h → `You are timed out for 3 days`; exactly 24 h → `1 day`; 23 h 59 m → `23 hours`; 1 h 59 m → `1 hour`; 59 m 1 s → `59 minutes` (minutes = `min(59, max(1, ceil(ms/60000)))`); 20 s → `1 minute`; null → `You are timed out Indefinitely`. `isTimeoutActive` past → false, null until → true. `formatTimeoutEnd` cases with fixed dates (America/Denver via `toLocaleString` mocked or `timeZone` param defaulting to device zone). `canTimeOut` owner→mod true, mod→mod false, self false, DM false.
- [x] FAIL → implement → PASS → mobile suite.

### Task 7 — App API and hook
**Files:** modify `mobile/utils/api.ts` (`GroupDetails` gains `myChatTimeout?`, `chatTimeouts?`; `groupApi.modDeleteMessage(api, groupId, messageId)`, `groupApi.setChatTimeout(api, groupId, userId, duration)`, `groupApi.clearChatTimeout(api, groupId, userId)` hitting `/api/chat/...`); create `mobile/hooks/useChatModeration.ts`.
**Produces:** `useChatModeration(groupId)` → `{ timeOut(userId, key), endTimeout(userId), modDelete(messageId) }`, each a `useMutation`; on success invalidate `['groupDetails', groupId]` and `broadcastGroupUpdate(getToken, groupId)` (so the timed-out person's open app refetches at once); errors → `Alert` via `getErrorMessage`. `modDelete` updates the messages cache optimistically like `deleteMessage` and restores on error. Success toasts: `Timed out for 1 hour` / `Timed out indefinitely` / `Timeout ended`.
- [x] `tsc` clean (no unit test: thin wrappers; covered by device checklist).

### Task 8 — Refused sends/reactions fail cleanly
**Files:** modify `mobile/utils/chatMutations.ts`, `mobile/utils/__tests__/chatMutations.test.ts`, `mobile/hooks/useMessages.ts`.
**Produces:** send and reaction `retry` functions return `false` when `isTimedOutError(error)`; their `onError` invalidates `['groupDetails', groupId]` and marks the message failed (existing failed state) without the generic error toast; reaction undo still runs.
- [x] Tests: retry predicate returns false for `new Error('timed out')` at attempt 0, still true for a network error; `onError` with a timed-out error calls `invalidateQueries` with `['groupDetails', 'g1']`.
- [x] FAIL → implement → PASS → mobile suite.

### Task 9 — Timed-out input
**Files:** modify `mobile/components/ChatMessageInput.tsx`; create `mobile/hooks/useNow.ts` (`useNow(intervalMs: number, enabled: boolean): number`).
**Produces:** prop `timeoutLabel?: string | null`. When set: `TextInput` `editable={false}`, value cleared and `placeholder={timeoutLabel}` with `placeholderTextColor={colors.danger}`; photo/tray button disabled and dimmed; send button `backgroundColor: colors.danger`, `Feather name="x"` white, `disabled`; mention suggestions and tray hidden; `accessibilityState={{ disabled: true }}`.
- [x] `tsc` clean; render check on device (checklist).

### Task 10 — Chat screen wiring
**Files:** modify `mobile/app/group-chat/[id].tsx`, `mobile/components/ChatActionPanel.tsx`; create `mobile/components/ChatTimeoutSheet.tsx`.
**Produces:** `ChatActionPanel` props `showTimeOut?: boolean`, `timeOutLabel?: string` (`Time out Sam`), `onTimeOut?: () => void` (row with `Feather "clock"`, danger color, in the Edit/Delete group). `ChatTimeoutSheet({ visible, name, current: { until } | null, onPick(key), onEnd(), onClose })` — 9 options, plus current end + **End timeout** when `current` is active; styled like `GroupMuteSheet`.
In the screen: `now = useNow(30_000, !!myChatTimeout)`; `timedOut = isTimeoutActive(details.myChatTimeout, now)`; pass `timeoutLabel` when timed out. When timed out: hide reactions, reply, edit, delete, pin in the panel (copy stays). `showDelete` = (own && !timedOut) || (canManage && !isDM); delete routes to `modDelete` when not own. `showTimeOut` = `canTimeOut(me, sender, group)` and message kind `user`. Refetch `groupDetails` on screen focus (`useFocusEffect`). Confirm alert for mod delete: `Delete this message for everyone?`.
- [x] `tsc` clean; mobile suite passes.

### Task 11 — Member list and notification
**Files:** modify `mobile/components/GroupDetailsView.tsx`, `mobile/components/GroupDetailsScreen.tsx`, `mobile/utils/notificationIcons.ts` (`'chat-timeout': { name: 'clock', color: '#EF4444' }`), `mobile/utils/notificationRouting.ts` (opens the group's chat), `mobile/app/_layout.tsx` (received listener: `chat-timeout` → invalidate `['groupDetails', data.groupId]`).
**Produces:** for owner/mods, rows where `canTimeOut` is true show a red `Timed out · until Tue 3:15 PM` (or `· Indefinitely`) caption when active, and a clock button opening `ChatTimeoutSheet`.
- [x] Test in `notificationRouting.test.ts`: `chat-timeout` with `groupId: 'g1'` routes to `/group-chat/g1`. FAIL → implement → PASS.
- [x] `tsc` clean; mobile suite passes.

### Task 12 — Verify
- [x] Backend full suite; mobile `tsc` + full jest (local copies). Owner: run `npm test` in `mobile/` on Windows.
- [x] Reread spec line by line against the code; fresh reviewer checked the change against the spec (6 findings, fixed).
- [ ] Update `docs/plans` status and the project to-do; ship order: Supabase migration → backend → app build.
- [ ] Device checklist: mod deletes another's text and photo (both devices update); member can't see Delete on others; owner times out mod for 5 min → mod sees red input "You are timed out for 5 minutes", red X send, can't type, can't react/pin/edit/delete, can still RSVP and vote; label counts down to "1 minute" then input returns by itself; 1 day → "1 day"; Indefinitely; End timeout from member list restores input within seconds; offline-queued message sent after being timed out shows failed, no endless "Sending…"; push received and Notifications entry; no system message; regular member sees no tag; leave + rejoin keeps timeout; DM shows none of this; dark mode.
