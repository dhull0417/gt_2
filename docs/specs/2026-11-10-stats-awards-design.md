# Stats & Attendance reimagined: awards (design)

_2026-11-10. Status: draft for approval. Size: project (backend + one migration + app screen)._

## Intent
Stats & Attendance today is a members table (attendance rate, streak) plus a history list. Groups should
*enjoy* looking at it: recognition for the people who show up and answer, and some teasing for the
people who don't. It stays a Premium feature that any member of a Premium group can open.

## Goals
- An awards section with fun titles, all-time, for the whole group's history.
- Joke awards that organizers see by default and can choose to reveal to everyone.
- A "Your stats" card so every member sees their own numbers and rank.
- Start recording RSVP timing so speed-based awards become possible.

## Non-goals
- Seasons / resets (all-time only for now; owner decision).
- Notifications or pushes about awards.
- Changing what counts as attendance ("I'm In" on a meetup that happened; cancelled meetups ignored).
- Back-filling timing data for past meetups (it doesn't exist).

## Anti-goals
- Joke awards leaking to members when not revealed, including through the API.
- Awards decided by one or two meetups.

## Decisions (owner)
- All-time leaderboard.
- Joke awards visible to owner + moderators only; an organizer can reveal them to the whole group.
- Approach A: awards computed on each request from archived history; RSVP timing stored as a small log on each meetup and copied into the archive.
- Award list and names as below ("Ol' Reliable", "Chatty Cathy" renamed by the owner).

## Awards
⏱ = needs data recorded from ship day onward; hidden until there is enough of it.

| Key | Title | Emoji | Winner is | Data | Kind |
|---|---|---|---|---|---|
| `reliable` | Ol' Reliable | 🫡 | most meetups In (tie-break: higher rate) | existing | public |
| `streak` | Iron Streak | 🔥 | longest run of In in a row, ever | existing | public |
| `responder` | Always Answers | ✋ | most In + Out responses | existing | public |
| `quickDraw` | Quick Draw | ⚡ | lowest average time from RSVPs opening (for them) to their first answer | ⏱ | public |
| `plusOne` | Plus-One Pro | 👯 | most guests brought, total | ⏱ | public |
| `chauffeur` | Chauffeur | 🚗 | most ride seats offered as a driver, total | ⏱ | public |
| `snackCaptain` | Snack Captain | 🍕 | most items-to-bring claimed, total | ⏱ | public |
| `chatty` | Chatty Cathy | 💬 | most chat messages in the group | Supabase | public |
| `voice` | Voice of the People | 🗳️ | most polls voted in | existing (polls) | public |
| `decliner` | Professional Decliner | 🙅 | most Outs | existing | joke |
| `ghost` | The Ghost | 👻 | most meetups with no reply | existing | joke |
| `buzzer` | Buzzer Beater | ⏰ | most first answers in the final 2 hours before the RSVP deadline (or start, if no deadline) | ⏱ | joke |
| `weathervane` | Weathervane | 🌀 | most RSVP changes (after the first answer) | ⏱ | joke |

### Rules (builder's / my calls, marked)
- **Eligible people:** current group members only (as today). _My call._
- **Meetup-based awards** (`reliable`, `streak`, `responder`, `decliner`, `ghost`): a person needs ≥ 3 eligible meetups. _My call._
- **Timing awards** (`quickDraw`, `buzzer`, `weathervane`): only meetups that have an `rsvpLog`. A person needs ≥ 3 such meetups they answered. `quickDraw` only uses meetups that have an `rsvpOpenDate` (generated meetups without one are created months ahead, so "time to answer" would be meaningless). _My call._
- **Minimums to award at all:** value > 0 always; `chatty` ≥ 10 messages; `voice` ≥ 3 polls; `weathervane` ≥ 2 changes; `buzzer` ≥ 2 last-minute answers. _My call._
- **Ties share the award** (all tied winners listed).
- An award with no qualifying winner is omitted (the app shows nothing for it; no "not enough data" card clutter). _My call._
- **Opening time for Quick Draw:** the person's priority-tier `opensAt` if they are in a tier, else `rsvpOpenDate`.
- **What counts as a response** for timing: the member's own RSVP (In, Out, or joining the waitlist). Admin overrides ("Mark as In/Out"), waitlist promotions and priority bumps are not logged. _My call._
- RSVPs sent offline are timed when the server receives them. Accepted.
- **Chauffeur** counts seats offered by drivers (not riders actually carried), because seats exist on every rides meetup while assignments are optional. _My call._
- **Chatty Cathy** counts `kind = 'user'`, not deleted, all-time (so it works on day one). DM groups never have stats.
- **Voice of the People** counts non-cancelled polls in the group where the person is in any option's `voters`.

## Visibility
- Server decides. Non-organizers get joke awards only when `group.statsRevealJokes` is true.
- **Members table:** today it shows every member's "X out · Y no reply" to everyone, which would give away the joke awards. For non-organizers, unless revealed, the server sends `declined` and `noResponse` as `null` for *other* members and the app shows only "N of M · rate · streak". _My call — confirm._
- "Your stats" always shows your own numbers, including your own Outs and no-replies. Your rank in joke categories is shown only when you could see the joke awards. _My call._
- Stats is new in 1.4 (not in the 1.3.x store builds), so no legacy-app handling is needed.

## Data changes
**Meetup** (`meetup.model.js`): `rsvpLog: [{ user: ObjectId, status: 'in'|'out'|'waitlist', at: Date, _id: false }]`, default `[]`. Appended in `rsvpMeetup` only when the actor is the member themself and the status actually changed (`statusUnchanged` false). Cap at 200 entries per meetup (drop oldest). _Cap is my call._

**AttendanceRecord**: add `rsvpLog` (same shape), `rsvpOpenDate`, `rsvpCloseDate`, `tierOpens: [{ user, opensAt }]` (flattened from `priorityTiers`), and per-person `guestsBy: [{ user, count }]` (Mongo user id, converted from the clerkId in `guests`), `itemsBy: [{ user, count }]`, `seatsBy: [{ user, seats }]` (drivers only). Filled by `toRecord`, so live expired meetups and archives behave the same. Old records simply lack them.

**Group**: `statsRevealJokes: Boolean`, default `false`.

**Supabase migration** (`supabase/migrations/20261110000000_chat_message_counts.sql`): `public.chat_message_counts(p_group_id text) returns table(sender_id text, messages bigint)`, counting `kind = 'user' and deleted_at is null`. `execute` granted to `service_role` only (revoked from `public`, `anon`, `authenticated`). Backend calls it through `utils/supabaseAdmin.js`; if Supabase isn't configured or the call fails, `chatty` is omitted (logged, never thrown).

**Account deletion**: also pull the user's entries from `Meetup.rsvpLog` and `AttendanceRecord.rsvpLog` / `guestsBy` / `itemsBy` / `seatsBy` / `tierOpens`.

## API
`GET /api/groups/:groupId/stats` (unchanged route, Premium, members only) adds:
```
awards: [{ key, title, emoji, joke: boolean, unit: string,       // unit e.g. "meetups", "min avg"
           winners: [{ _id, firstName, lastName, profilePicture, value }],
           leaderboard: [{ _id, firstName, lastName, profilePicture, value, rank }] }]   // top 5, ties share rank
me: { _id, categories: [{ key, value, rank|null, of }] }        // own values for every available category
viewer: { isOrganizer: boolean, jokesVisible: boolean, revealJokes: boolean }
```
`summary`, `members`, `meetups` keep their shapes (with the null rule above).

`PATCH /api/groups/:groupId/stats-settings` `{ revealJokes: boolean }` — owner or moderator, Premium not required (it's a setting). Returns `{ revealJokes }`.

## Screen (`mobile/app/group-stats/[id].tsx`)
Top to bottom:
1. Header (as today, CSV export for organizers).
2. Summary tiles (as today).
3. **Your stats** card: your rate, meetups In, best streak, and your rank in each award you could see ("#2 of 9").
4. **Awards**: a 2-column grid of cards — emoji, title, winner avatar(s) + name(s), value with unit. Tap a card → bottom sheet with the top 5 and a one-line description of how it's decided.
5. **Hall of Shame** (joke awards): organizers see it with a "Only organizers can see this" note and a **Reveal to the group** switch (`ToggleSwitch`). Members see it only when revealed, without the switch.
6. Members table and History (as today, with the null rule).
Uses theme tokens (light/dark), `PressableOpacity`, existing `LoadingAnimation`/error states. _Layout is my call._

## Approaches considered
- **A (picked):** log on the meetup, copied to the archive, awards computed per request. Fits the existing `groupStats.js`; data is small (a weekly group has ~52 meetups a year).
- B: nightly precomputed leaderboard — instant but stale, another cron job.
- C: separate RSVP-event collection — more cleanup paths, no gain.

## Testing
- Backend `node --test`: pure award functions over fixture events (each award's winner, ties, thresholds, missing ⏱ data, Quick Draw tier opening, Buzzer window, Weathervane counting); visibility (member vs organizer, revealed vs not, null rule); `rsvpLog` appended only for self-RSVP with a change and capped; `toRecord` per-person fields; stats-settings permissions; chat counts omitted when Supabase is off.
- Mobile jest: award-card value formatting (e.g. "4 min avg", "12 meetups").
- Device: organizer vs member view, reveal switch, dark mode, a group with no ⏱ data.

## Ship order
Backend before the app (new fields are additive; the old 1.4 build ignores them). Run the Supabase migration before or with the backend deploy; without it, Chatty Cathy just doesn't appear.

## Left to the builder
Exact copy for award descriptions, card styling details, sheet component choice (reuse existing modal-sheet pattern).

## Changes after review (2026-11-10)
- People still on the waitlist when a meetup ends count as having answered (not "no reply"); the archive now keeps `waitlist`. Always Answers counts In + Out + waitlisted.
- Always Answers is rank-only (no numbers) for members while the Hall of Shame is hidden, because its number next to "N of M" would reveal Outs and no-replies by subtraction.
- A meetup whose log started after people had already answered (e.g. RSVPs made before this shipped) is marked `rsvpLogPartial` and its log is ignored.
- The 200-entry log cap drops the oldest entry that isn't someone's first answer.
- The reveal switch saves with `updateOne` instead of saving the whole group.
- Accepted: Quick Draw times from the *scheduled* tier opening (an early-opened tier can score 0 minutes); a slow Supabase can delay the stats screen by up to 8 s (Chatty Cathy is then left out).

## Change 2026-11-11 (owner)
- The 3-meetup minimum is removed: one eligible meetup (or one logged answer for timing awards) is enough, and Plus-One Pro / Chauffeur / Snack Captain appear once a single meetup carries the data. Value minimums stay (Chatty Cathy 10, Voice 3 polls, Buzzer 2, Weathervane 2).
