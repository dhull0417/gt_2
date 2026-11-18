# Past Meetups — design

Size: project (backend + mobile). Approach A (picked by user).

## Intent
Members want to look back at what happened at a group's past meetups: where it was, who came, who didn't, the tournament result, who brought what, and who drove whom. Today finished meetups are deleted 10 days after they start and only a stats-sized copy (AttendanceRecord) survives, which lacks the location, item names and ride pairings.

## Goals
- A **Past Meetups** tile on Group Details opens a newest-first list of the group's finished meetups.
- Tapping one opens a read-only detail page showing: name, date/time, location; In / Out / Undecided (and Waitlist when non-empty), with guest counts per person; tournament result; items brought (item name → who brought it); rides (each car: driver, seats, riders, guests).
- The archive keeps, from now on: **location, item names with who brought each, and every car's driver + riders (+ guests)** (user).
- Same view for a meetup finished 3 days ago (still live) or 3 years ago (archived).

## Non-goals
- Recovering item names, rides or location for meetups already archived (that data is gone). They show what the archive has; the sections with no data are hidden.
- RSVP question answers, notes, cancel notes, polls. (Can be added to the archive later the same way.)
- Cancelled meetups — not listed (they're not archived today and don't count toward stats).
- Editing anything about a past meetup.

## Anti-goals
- Don't add old meetups back into `GET /api/meetups` / the live meetups cache.

## Backend
1. **AttendanceRecord** gains (all `default: undefined`, so older records read as "not recorded"):
   - `location: String`
   - `items: [{ name: String, by: [ObjectId] }]` — one entry per item that someone claimed.
   - `cars: [{ driver: ObjectId, seats: Number, riders: [ObjectId], guests: Number }]` plus `needsRide: [ObjectId]` (passengers left without a car).
2. `ARCHIVE_FIELDS` adds `location bringItems`; `toRecord` fills the new fields from `bringItems`/`bringClaims`/`rides` (`rides` already selected). Because `archiveMeetups` uses `$setOnInsert`, every meetup still alive when this ships gets the full record.
3. **New endpoints** (group members only; same membership check as stats):
   - `GET /api/groups/:groupId/past-meetups?before=<ISO>&limit=20` → `{ meetups: [{ id, name, date, location, inCount, outCount, undecidedCount, hasTournament }], nextBefore }`. Built from archived records + live expired meetups (same merge as `loadEvents`).
   - `GET /api/groups/:groupId/past-meetups/:meetupId` → full detail with users populated (`_id, firstName, lastName, profilePicture`) and `tournament: { id, format, summary }` when a Tournament exists for that meetup. Members who have since left the group still show (name from User; "Former member" if the user is gone).
4. Undecided = `members − in − out − waitlist`, computed server-side.
- **Premium:** my call — not gated. Items/rides only exist for premium groups anyway, and attendance history is useful to everyone. Flag if you want it premium-only like Stats.

## Mobile
- `DetailTileKey` gains `'past'`, placed after `meetups` → order: invite, calendar, meetups, **past**, members, schedule, settings. Subtitle: none (avoids an extra request on every Details open). Icon `rotate-ccw`, gray-blue tint. My call.
- `app/group-past-meetups/[id].tsx` (+ `_layout.tsx`): list, infinite scroll via `nextBefore`, pull to refresh, offline/error states like other screens. Row: name, date, location, "8 in · 2 out · 3 undecided".
- `app/past-meetup/[id].tsx` (meetup id, `groupId` as a search param; + layout): read-only detail page. Sections hidden when empty/unrecorded. Tournament section shows the summary and a "See results" button to the existing `/tournament/[id]` screen.
- Rides rendered with a small read-only car list (not the live `RideCars`, which takes a live `Meetup`) — my call.
- Route segments added to the allowed list in `app/_layout.tsx`.

## Decided
Approach A; archive item names + who, drivers + riders (user); location kept (my call); list newest-first, paged (my call); not premium-gated (my call, flagged).

## Left to the builder
Exact visuals, matching existing cards; page size.
