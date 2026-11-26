# Group Details — squircle grid redesign

Size: medium change (mobile only, no backend). One new route, one new modal, one new tile component.

## Intent
The group details page is a long stack of full-width buttons, a collapsible schedule card and a full member grid. Replace everything below the hero + Next Meetup with a 2-wide grid of squircle tiles, each opening its own destination, so the page reads as a compact hub.

## Goals
- Keep, unchanged and in place: the big group photo with the name under it, then the Next Meetup card.
- Below that, a 2-column grid of squircle tiles (2 wide × as many rows as needed).
- Members open on their own page, each section (Owner & Moderators, Members) sorted A–Z.
- Schedule Details open in a page-sheet modal.

## Non-goals
- No backend or API changes.
- No changes to the invite screen, settings screen, or GroupMeetupsModal themselves.
- No redesign of DMs.

## Tiles (in this order)
| Tile | Icon (Feather) | Subtitle (live info) | Tap | Shown when |
|---|---|---|---|---|
| Invite Friends | user-plus | "QR & link" | push `/group-invite/[id]` (QR, share, copy, link settings) | not DM |
| Add to My Calendar | calendar | — | `addGroupToCalendar(api, id, name)` (as today) | not DM |
| Upcoming Meetups | list | "N upcoming" / "None scheduled" (scheduled, future, this group, from `useGetMeetups` cache) | open `GroupMeetupsModal` | not DM |
| Group Members | users | "N members" | push `/group-members/[id]` | not DM |
| Schedule Details | clock | frequency of the single routine (e.g. "Weekly"), "N schedules" if several, "Not set" if none | open `ScheduleDetailsModal` | not DM |
| Group Settings | settings | — | push `/group-settings/[id]` | owner or moderator |

Each tile keeps the pastel chip colour family it has today (teal invite, blue calendar, amber meetups, purple members, blue schedule, gray settings) — my call.

## Squircle tile (decided: option 1)
`View` with `borderRadius` ≈ 28 and `borderCurve: 'continuous'` (true squircle on iOS, rounded rect on Android). Square (`aspectRatio: 1`), width = half the row minus a 12 px gap. Icon chip top-left, label + subtitle bottom-left. Press feedback via existing `PressableOpacity`. With an odd tile count the last tile sits alone on the left (my call).

## Members page — `/group-members/[id]` (new)
- Reads the cached `useGetGroupDetails(id)` + `currentUser`; same loading/offline/error handling as Details.
- Two sections as today, each sorted case-insensitively by `getUserDisplayName`.
- Carries over everything member tiles do now: role badges, timeout badge, remove ✕ (same permission rules), tap → Send DM sheet, Chat timeout (owners/mods). That logic moves out of `GroupDetailsScreen` into the new page.
- Header: back arrow + "Members". Registered in the root stack like `group-settings`.

## Schedule Details modal (new `ScheduleDetailsModal`)
`Modal presentationStyle="pageSheet"` (same pattern as Next Meetup). Body is the existing collapsible "Details" content moved verbatim (schedules, routines, location, capacity, RSVP window), always expanded. Close button + Android back.

## Top bar
Keep the back arrow and the `GroupHeaderTitle` (it was just changed to match the chat header so the logo doesn't jump between screens). Remove the calendar and settings icons — both now live in the grid. (Changed from my earlier proposal of removing the title.)

## DMs
No Next Meetup, no grid (as today). DMs keep showing their member tiles inline, unchanged.

## Leave Group
Stays below the grid for non-managers.

## Decided
Invite = one tile to the invite screen (user). Members = own page, A–Z per section (user). Schedule = modal (user, agreed). Live subtitles where cheap (user delegated). Squircle via borderCurve (user, option 1).

## Left to the builder
Exact paddings/font sizes, matching existing card styles.

## Risk
`GroupDetailsScreen.tsx`, `GroupDetailsView.tsx` and `group-chat/[id].tsx` have uncommitted edits made during this session (GroupHeaderTitle work). Build on top of them; don't revert.
