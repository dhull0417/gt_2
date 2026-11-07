# Tester feedback fixes (1.4.x) — design

_2026-11-07. Size: a batch of small-to-medium changes (8 items), one release. All reports came from the live 1.3.3 store build; every fix lands in 1.4 (`staging`)._

## Intent
Testers on the live app hit eight problems. Some are already fixed by 1.4; the rest get fixed before 1.4 ships so the release answers every report.

## Goals / non-goals
**Goals:** each item below behaves as described, with tests where logic is testable.
**Non-goals:** push notification wording (stays in the group's time); schedule editors (owners keep setting times in the group's timezone); chat search ranking or more results.
**Anti-goals:** no new native packages (keeps 1.4 buildable as-is); no change to how the chat cache is stored.

## Items

### 1. Search result jumps to the message (approach A, chosen by you)
- Tapping a search result returns to the chat with `jumpTo=<message id>` (and its `created_at`).
- The chat loads older pages (existing `fetchOlder`) until the message is in the cache, up to 20 pages (1,000 messages). Then it scrolls the message into view and flashes a highlight on its bubble (~1.5 s).
- Not found within the cap, or the message was deleted: a toast "That message is too far back to jump to" / "That message was deleted" and the chat stays at the bottom.
- While jumping, the history loader shows at the top and auto-scroll-to-bottom is suspended.
- Pinned-message list taps get the same jump (my call: same code path, nearly free).

### 2. Editing long messages
- Root cause (1.3.3): the edit dialog didn't move above the keyboard; a long message grows the box so Save sits under the keyboard. 1.4 already lifts it.
- Hardening: the edit box's height is capped to a fraction of the space above the keyboard so Save/Cancel are always visible on small phones.

### 3. Chat white screen
- The chat is hidden behind the loader until group, current user and messages are all available; if one never arrives it stays blank forever.
- After 8 s without all three, show "Couldn't load this chat" with **Retry** (refetches all three) and **Back**. Whatever is ready still shows as soon as it is.
- The error screen names what was missing in small text ("group", "your profile", "messages") so a tester's screenshot tells us why. The app has no crash reporting today; adding one (e.g. Sentry) is a separate decision.

### 4. Links clickable
- Chat already linkifies in 1.4.
- Also linkify meetup descriptions (detail sheet and card) using the existing `utils/linkify` and `openLink` (my call).

### 5. Times in the viewer's timezone
- One helper in `utils/meetupTime.ts`: `formatMeetupTime(m, viewerZone?)` → e.g. `9:00 PM ET`. Uses the meetup's start instant (`meetupStartInstant`) shown in the phone's timezone.
- Abbreviation shown only when the viewer's zone differs from the group's; same zone shows `7:00 PM` as today (my call).
- Dates and day grouping (Home day sections, detail header, chat "Next Meetup" bar, group calendar list, Group Details next-meetup card, notifications list, RSVP-open/deadline labels) also use the viewer's zone, so a late meetup that falls on the next day for the viewer is grouped under that day.
- Editing a meetup's time still uses the group's time, labelled with the group's abbreviation.

### 6. Owner/moderator removes a guest
- New route `PATCH /api/meetups/:meetupId/guests/:clerkId` with `{ count }`, allowed for the group owner/moderators (and the host themself). Lowering guests promotes the waitlist (existing `promoteWaitlist`). The host gets a notification ("Your guests were removed from X") (my call).
- Meetup details: a guest tile and the member sheet offer **Remove guests** to managers.
- Old apps are unaffected (new route only).

### 7. Guests never take a spot that isn't free (approach A, chosen by you)
- Adding guests is checked against open spots whether or not the host is In (if not In, the host's own spot counts too). Too many → 409 with "Only N spots left."
- Tapping In with guests that don't fit: the whole party goes to the waitlist (or "Full" without a waitlist); nobody else moves.
- Priority RSVP: a bump is only made when bumping one person makes room for the requester **and** their guests; otherwise no bump, the requester's party is waitlisted. (Today one person is bumped even if the party needs more room, over-filling the meetup.)
- Waitlist promotion already counts guests; unchanged.

### 8. Profile picture
- iOS currently uses the system picker's built-in crop (`allowsEditing`), which hangs on iCloud-stored photos until they finish downloading.
- Use the app's own `ImageCropperHost` on iOS too (already used on Android); the picker returns the photo, then our cropper opens.
- Show a spinner on the avatar from picking through upload, and an error alert if the photo couldn't be read.
- Applies to every square-photo pick (profile, group photo, new-group photo).

## Constraints
- Everything ships in the 1.4 native build; no OTA-only assumptions.
- Backend changes must stay safe for 1.3.3 clients (runbook section 5): items 6 and 7 are both fine (new route; stricter checks are bug fixes).
- Line endings: files are CRLF; keep them.

## Left to the builder
Exact highlight animation; toast wording beyond the above; where the "Remove guests" button sits in the sheet.
