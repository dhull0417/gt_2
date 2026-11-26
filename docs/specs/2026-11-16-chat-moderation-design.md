# Chat moderation: mod deletes and timeouts — design

_2026-11-16. Approved approach: A (backend decides, Supabase enforces)._

## Intent

Owners and moderators need a way to handle a misbehaving chatter: remove a message, and stop
someone from chatting for a while (5 min, 15 min, 30 min, 1 hr, 2 hr, 12 hr, 1 day, 1 week, or
indefinitely).

## Goals

1. **Mod delete.** In a group chat (not DMs), the owner can delete anyone's message; moderators can
   delete regular members' messages (not the owner's or other moderators'). (Changed 2026-11-21.)
   It is wiped like a normal delete (text, photo, reply preview, mentions) and shows the same
   "message deleted" placeholder. Nobody is told a mod did it.
2. **Timeouts.** An owner/moderator can time someone out of one group's chat for one of the nine
   lengths above. While timed out, that person cannot send, react, edit, delete their own
   messages, or pin/unpin in that group's chat. Polls and RSVPs keep working.
3. **Quiet.** Only the timed-out person and the group's owner/moderators know. No system message
   in the chat.
4. In the chat screen, the timed-out person's input field shows red text
   "You are timed out for [time left]" and the send button turns red with an X in it. Neither
   can be interacted with (no typing, no photo/attachment button, no send). It never names the mod.
   They get one push notification (and an entry on the Notifications screen) when a timeout starts.

   **[time left]** shows only the largest unit (owner's rule):
   - 1 day or more → days only: "2 days", "1 day"
   - 1 hour to under 1 day → hours only: "5 hours", "1 hour"
   - under 1 hour → minutes only: "12 minutes", "1 minute"
   - indefinite → "Indefinitely" ("You are timed out Indefinitely")
   Claude's call: whole units rounded down (1 h 59 m → "1 hour"), except the minute count rounds
   up so it never says "0 minutes"; singular for 1. The text updates as time passes (checked every
   30 seconds) and the normal input comes back by itself when the timeout ends.
5. Owners/moderators see a "Timed out · until …" tag on that person's row in the member list, with
   **End timeout**. Choosing a new length replaces the old one.

## Who may do what

- Delete any message in the group: owner. Delete regular members' messages: moderators (also
  messages from people who have since left the group).
- Time out: the owner may time out anyone except themself. A moderator may time out regular members
  only (not the owner, not other moderators). Nobody times themself out. Same rule for ending one.
- DMs: neither feature.

## Non-goals

- No timeout history/audit log, no reasons, no appeal flow.
- No change to polls, RSVPs, meetups or the rest of the group for a timed-out person.
- No new "deleted by a moderator" placeholder.

## Anti-goals

- The group must never learn someone was timed out (no system message, no tag visible to members).
- Role checks must not be duplicated into Supabase (that was approach B, rejected: roles change in
  many places and a missed sync would silently grant or keep mod powers).

## Constraints / facts found

- Chat messages live in Supabase (`public.messages`); owner/moderators live in Mongo (`Group`).
- The backend talks to Supabase with the service-role key (`utils/supabaseAdmin.js`). If
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` aren't set, these features cannot work; the routes
  return 503 with a clear message instead of pretending.
- Until `_hold/supabase/20261020010000_chat_phase3_lockdown.sql` runs, the messages table is wide
  open: an app on 1.3.x (or a modified client) can still post while timed out. The new app respects
  timeouts immediately; the block is airtight only after lockdown. Accepted.
- The Supabase connector can't reach the chat project (Chat-Practice), so the owner runs the new
  migration by hand, as with earlier chat migrations.

## Design

### Data
- **Mongo**, on `Group`: `chatTimeouts: [{ user: ObjectId(User), until: Date | null, by: ObjectId(User), createdAt: Date }]`.
  `until: null` = indefinite. One entry per user (setting again replaces). Expired entries are
  ignored when read and pruned on the next write.
- **Supabase**, new table `public.chat_timeouts (group_id text, clerk_id text, until timestamptz null,
  primary key (group_id, clerk_id))`. RLS on; signed-in people may read only their own rows; only the
  backend (service role) writes. Function `public.is_chat_timed_out(p_group_id text) returns boolean`
  (security definer): a row for the caller exists with `until is null or until > now()`.

### Enforcement (new migration `supabase/migrations/20261116000000_chat_moderation.sql`)
- `send_message`, `toggle_reaction`, `set_message_pinned` raise `'timed out'` when
  `is_chat_timed_out(group_id)`.
- The held lockdown file is updated so its insert and update policies on `messages` also require
  `not public.is_chat_timed_out(group_id)` (covers direct edits/deletes), and its `toggle_reaction`
  copy keeps the check.

### Backend (new routes in `routes/chat.route.js`, logic in a new `controllers/chatModeration.controller.js`, Clerk-protected)
- `DELETE /api/chat/:groupId/messages/:messageId` — owner/mod only, not a DM; the message must belong
  to that group. Sets `deleted_at` and blanks `content`, `image_url`, `reply_to_content`, `mentions`;
  removes the photo from storage. If it was the group's `lastMessage`, the preview becomes
  "Message deleted". Already deleted → 200 (idempotent).
- `PUT /api/chat/:groupId/timeouts/:userId` body `{ duration }` where duration ∈
  `5m 15m 30m 1h 2h 12h 1d 1w indefinite`. Checks the permission rules above and that the target is a
  member. Saves to Mongo, upserts the Supabase row, sends the push. Returns `{ userId, until }`.
- `DELETE /api/chat/:groupId/timeouts/:userId` — same permission rules; removes from both. No push.
- Mongo is written first; if the Supabase write fails the route returns 502 and rolls the Mongo
  change back, so the two never disagree about an active timeout.
- `getGroupDetails` adds `myChatTimeout: { until } | null` for the caller, and `chatTimeouts:
  [{ userId, until }]` (active only) for owner/moderators only.
- Membership removal / leaving keeps the timeout (rejoining doesn't clear it). Group deletion drops
  it with the group (Supabase rows removed alongside `removeAllChatMembers`).
- Push: title = group name, body "You've been timed out of the chat for 1 hour." /
  "…until a moderator lifts it.", type `chat-timeout`, persisted like `group-removed`, sent
  regardless of mutes.

### App
- Long-press menu (`ChatActionPanel`): **Delete** shows for own messages (unless timed out) and, for
  owner/mods in a group, for everyone's. Mod delete calls the backend route; own delete keeps today's
  path. New row **Time out [first name]** for owner/mods on a message from someone they may time out.
- Duration picker: a sheet listing the nine lengths; when the person is already timed out it also
  shows **End timeout** and their current end time.
- Member list (`GroupDetailsView`): for owner/mods, a "Timed out · until …" tag and **End timeout** /
  **Time out** actions on the rows they may act on.
- Timed out (`myChatTimeout` active): `ChatMessageInput` gets a `timeoutLabel` prop. When set, the
  text field is non-editable and shows the red "You are timed out for …" text in place of the
  placeholder, the attachment/photo button is disabled, and the send button is red with a white X
  and disabled. Reactions, reply, edit, delete and pin are hidden from the long-press menu (copy
  stays). The label comes from a pure function `formatTimeoutRemaining(until, now)` (unit-tested).
  When the end time passes while the chat is open the input comes back without a reload.
- Knowing promptly: group details are refetched when the chat screen gains focus and when a
  `chat-timeout` push arrives. If a send or reaction fails with `timed out`, the app refetches,
  marks that message failed (no retry, no endless "Sending…") and shows the banner. Offline-queued
  messages hitting this are failed the same way.
- Mods' member-list tag shows the end time in the viewer's local time: "until 3:15 PM" today,
  "until Tue 3:15 PM" within a week, otherwise "until Nov 30"; "Indefinitely" when open-ended.

## Decisions marked as Claude's call
- ~~Mods may delete the owner's and other mods' messages.~~ Reversed 2026-11-21: deletes now follow
  the same owner-vs-mod rule as timeouts (backend 403 "Moderators can't delete the owner's or other
  moderators' messages."; the app hides Delete for those messages).
- Rollback-on-Supabase-failure for timeouts; 503 when Supabase isn't configured.
- Group-list preview becomes "Message deleted" for a mod-deleted last message.
- No realtime subscription for timeouts; focus/push/error refetch is enough.

## Left to the builder
- Exact sheet styling (follow `GroupMuteSheet` / `OptionPickerModal`).

## Changes made while building (2026-11-16)
- **Ownership transfer ends the new owner's timeout** (both the Transfer Ownership route and the
  automatic transfer when an owner deletes their account). Otherwise a timed-out owner could never be
  un-timed-out: moderators can't act on the owner and nobody acts on themself.
- **Group details now include each member's and moderator's `clerkId`.** Messages identify senders
  by Clerk id, so the chat needs it to know who wrote a message ("Time out Sam"). Clerk ids already
  reach every member through chat messages, so nothing new is exposed. Side effect: the @mention
  list in group chats, which read `clerkId` from these members and so came back empty, now works.
- **The + menu keeps Poll and Event while timed out**; only Photos and Camera are hidden (polls stay
  usable, as asked). The field and send button are non-interactive as specified.
- **Member list:** members are shown as an avatar grid, not rows, so owners/moderators see a red
  clock badge on a timed-out member's avatar; tapping the member opens their sheet, which shows
  "Timed out · until …" and a **Chat timeout** button (opens the same length picker with End timeout).
- **send_message** returns an already-saved message (same client id) before checking the timeout,
  so a retry of a message that landed just before the timeout doesn't fail.
- A refused send/reaction (`timed out`) shows no toast; the group reloads so the red input appears.
  This lives in `utils/queuedMutations.ts` (`timedOutRefreshKey`) and `utils/chatMutations.ts` (`sendRetry`).

### After the fresh review (2026-11-16)
- A timed-out owner/moderator can't delete messages (theirs or anyone's): blocked in the app and by the
  backend (403). They can still time people out and end timeouts (that doesn't change messages).
- The timeout push loads the whole user (it was missing their push tokens, so nothing was sent).
- The saved notification has no sender (the moderator isn't revealed) and stores `meta.duration`;
  the Notifications screen reads "You've been timed out of the chat in <group> for 1 hour."
- "Message deleted" preview: decided by asking Supabase for the group's newest message, not by
  comparing timestamps (lastMessage's time is when the app reported the send, often seconds later).
- Ownership transfer retries clearing the new owner's Supabase timeout once and logs loudly if both
  tries fail (rare: the new owner would stay blocked in chat until the row is removed by hand).
