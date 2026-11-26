# Per-type group mute — design

_2026-11-07. Status: approved; implemented in the working tree (uncommitted)._

## Intent
A member can silence some kinds of notifications from one group while keeping others
(e.g. mute a busy group's chat but still hear about cancellations and time changes).
The swipe-to-mute on the Groups list opens the same sheet as the chat header bell,
replacing today's plain 3-button alert.

Size: medium change across backend (one model field, one helper, ~8 call sites) and
mobile (one new shared sheet, three callers).

## Goals
- Per group, mute any combination of 7 kinds, for "until next meetup" or "indefinitely".
- One shared mute sheet used by the chat bell and the Groups-list swipe.
- 1.3.x apps keep working and keep seeing full mutes as muted.

## Non-goals
- Changing the app-wide switches in Settings › Notifications (they stay as a separate layer).
- Muting in-app notification records (only pushes are muted, as today).
- Per-meetup muting.

## Anti-goals
- Making personal events mutable (see "never muted").
- A mute that silently behaves differently from what the sheet showed.

## Decisions (owner) 
- Switches sit under the mute options in the sheet so the member chooses what a mute covers.
- Option A data model (below).
- Swipe-to-mute uses the same sheet and look as the chat bell.

## Decisions (Claude's proposals, accepted 2026-11-07)
- One set of switches shared by both durations; all on by default, so tapping a duration
  without touching them = today's full mute.
- When "until next meetup" ends, the whole group mute (all kinds) is cleared.
- Re-opening the sheet shows the current state, with "Unmute all".
- @mentions get through a chat mute (as today). The app-wide Chat switch off still blocks them.
- App-wide setting AND group setting must both allow a push.
- A full mute also writes the legacy `mutedGroups` / `mutedUntilNextMeetup` fields; a partial
  mute clears them (an old app shows a partial mute as unmuted).

## Kinds
| Kind key | Label | Notification types |
|---|---|---|
| `chat` | Chat messages | chat, chat reactions |
| `rsvps` | Who's coming | meetup-rsvp-in, meetup-rsvp-out, meetup-waitlist-join |
| `changes` | Meetup changes | meetup-created, meetup-updated, meetup-restored, schedule-removed |
| `cancellations` | Cancellations | meetup-cancelled |
| `reminders` | Reminders | meetup-rsvp-reminder, meetup-rsvp-open, meetup-starting-soon |
| `polls` | Polls | poll-created, poll-closed |
| `groupUpdates` | Group updates | group-updated, group-member-joined |

**Never muted** (unchanged): group-invite, group-added, group-removed, group-deleted,
ownership-transferred, waitlist-promotion, priority-bumped, meetup-rsvp-admin-in/out.
Any type not in the table is treated as never muted.

## Data model (Option A)
`User.groupMutes: [{ group: ObjectId, until: 'nextMeetup' | 'indefinite', mutedTypes: [kindKey], updatedAt: Date }]`,
default `[]`, at most one entry per group.

Legacy sync, written by the server on every change:
- entry with all 7 kinds → group id in `mutedGroups` (indefinite) or `mutedUntilNextMeetup` (nextMeetup).
- partial entry or no entry → group id in neither.

## API
`PATCH /api/users/mute-group` body `{ groupId, muteType: 'indefinite'|'untilNext'|'none', mutedTypes?: kindKey[] }`.
- `mutedTypes` omitted (old apps, and the "I'm Out + mute" button) → all 7 kinds.
- `mutedTypes` empty with a duration → same as `none`.
- Unknown kind keys → 400.
- `none` → removes the entry and the legacy ids.
- Response: `{ muted, muteType, groupMutes }` (adds `groupMutes`; old fields unchanged).

## Delivery rule
One helper `isMutedFor(user, groupId, pushType, { aboutNextMeetup })` in `utils/groupMute.js`:
1. Type not in the kinds table → not muted.
2. User has a `groupMutes` entry for the group → muted iff the type's kind is in `mutedTypes`
   (applies regardless of `MUTE_ALL_PUSHES_ENABLED`; it was set by a new app on purpose).
3. Else, group in a legacy list (mute set by a 1.3.x app) → today's behaviour:
   chat and reminders always muted; other kinds muted when `MUTE_ALL_PUSHES_ENABLED` is on,
   otherwise only when `aboutNextMeetup`.
4. Else not muted.

Callers switched to it: `notifyAndPersist`, `chatPush.pickRecipients` (mention bypass kept),
the legacy last-message push and the reaction push in `group.route.js`, the 30-minute and
RSVP-reminder jobs (their `mutedGroups: { $ne }` query filters move into the helper).

Expiry: the expire job also pulls `groupMutes` entries with `until: 'nextMeetup'` for the
expired groups (alongside the existing legacy pull). Leaving/removal from a group also pulls the entry.

## Mobile
- New `components/GroupMuteSheet.tsx`: the chat sheet's existing look (amber "until next meetup",
  red "Mute" options, Cancel), with a "What to mute" list of 7 `ToggleSwitch` rows above the
  two options. If the group is muted: switches show the current kinds, the option matching the
  current duration is marked, and an "Unmute all" button appears. Duration buttons are disabled
  when no switch is on. In DMs only Chat is shown (the other kinds don't happen in DMs).
- Chat header bell and Groups swipe both always open the sheet (today a tap on a muted bell
  unmutes instantly; now it opens the sheet with "Unmute all").
- New pure `utils/groupMute.ts`: `muteStateFor(user, groupId) → { state: 'none'|'partial'|'full', until, mutedTypes }`,
  reading `groupMutes` first and falling back to the legacy lists as a full mute.
- Bell: `bell` (none), `bell-off` red (full), `bell-off` amber with clock (full, until next), and a
  distinct partial look (`bell` with a small amber dot). Groups list muted icon: shown for full
  and partial; partial uses the lighter variant.
- Toast after saving: "Muted chat messages" / "Muted 3 kinds" / "Muted until the next meetup", with Undo
  restoring the previous state.
- The "I'm Out + mute" buttons (Home, MeetupDetailModal) keep sending `untilNext` with no
  kinds = full mute; their Undo restores the mute the member had before (which may be partial).

## Left to the builder
Exact spacing/colours of the switch list and partial-bell dot (use theme tokens, both themes).

## Testing
- Backend `node --test`: `isMutedFor` (each rule, every kind, exempt types, legacy+flag cases),
  `applyMuteChange` (legacy sync, defaults, validation), `pickRecipients` with partial mutes.
- Mobile jest: `muteStateFor`.
- Device: chat bell and swipe open the same sheet; partial mute of chat in one group still
  delivers a cancellation; an old-app full mute still silences chat.
