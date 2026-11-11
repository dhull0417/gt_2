# Ride assignments (2026-11-10)

## Intent
Rides (Premium) today only record who is driving (with seats) and who needs a ride; the meetup
shows a seat balance but never says who rides with whom. This adds matching riders (and their
guests) to drivers, four ways, all visible on the meetup:

1. **Auto-assign rides** (owners and moderators): one tap places everyone who isn't in a car yet.
2. **Owners and moderators** put any rider or guest in any car, move them, or take them out.
3. **Drivers** add people who aren't in a car to their own car, or take people out of it.
4. **Riders** put themselves and their guests in cars with room, or take them out.

All changes happen immediately; nobody has to accept.

## Goals
- Everyone going sees the cars. **One line per person**: the rider and each guest ("Ana",
  "Ana's guest", "Ana's guest 2"), so a driver counts heads by counting lines. Plus open seats and
  a "Still needs a ride" list (also one line per person).
- Auto-assign never moves anyone already in a car.
- Auto-assign groups people who live near each other, using zip codes.
- Riders are told whenever they (or any of their guests) lose a ride they had, unless they did it.

## Non-goals
- Driving distance, routes, pickup order or times. Accept/decline for assignments. Running
  auto-assign automatically. Showing anyone's zip code to other members. Naming guests.

## Decisions
**Data (approach A, chosen by the owner, extended for split parties).** Each passenger entry in
`meetup.rides` gains:
- `driver` (User id or `null`): the car the rider sits in. `null` = the rider needs a ride.
- `guestRides: [{ driver, count }]`: where their guests sit. Guests not covered by these counts
  need a ride.
Additive fields; 1.3.x apps never had rides, so no legacy handling. Guests are only a count, so
the app draws guest lines from counts.

**Seats.** A car's load = riders whose `driver` is it + all `guestRides` counts for it. Open seats
= driver's `seats` − load.

**Guests while in a car (owner's rule).** While the rider or any of their guests is in a car, the
guest count can't go up: 409 `leave_ride_first` ("Take yourself and your guests out of your car
before adding guests."). Applies to the RSVP guest counter and the guests route, whoever asks.
Lowering guests is allowed and removes guest seats from the last `guestRides` entry first.

**Joining a car without room for everyone (owner's rule).** When a rider places themselves and
the car can't hold them plus all their unplaced guests, the app asks: "Not enough space for you
and your guests with this driver. Your remaining guests will need to ride with another driver."
**Join anyway** places the rider plus as many guests as fit; **Don't join** does nothing. The
remaining guests appear under "Still needs a ride".

**Who may change what** (server-enforced, mirrored in the app):
| Actor | May do |
|---|---|
| Owner or moderator | Place, move or remove any rider or guest in any car; auto-assign. *(Claude's call: any manager, via `canManageGroup`.)* |
| Driver | Add people who aren't in a car (riders or guests) to their own car; take people out of their own car. Can't take people out of another car. *(Claude's call.)* |
| Rider | Place, move or remove themselves and their own guests. |

**One assignment call** (`PATCH /api/meetups/:meetupId/rides/assignment`):
`{ riderId, driverId: string | null, rider: boolean, guests: number, fromDriverId?: string | null }`
- `driverId` set: move the rider (if `rider`) and `guests` of their guests into that car. Guests
  come from `fromDriverId`'s car when given, otherwise from the unplaced ones.
- `driverId` null: take the rider (if `rider`) and `guests` guests out of `fromDriverId`'s car
  (required when `guests > 0`).
- 409 errors: `car_full` (body includes `room`), `not_driver`, `not_rider`, `already_assigned`
  (a driver adding someone who is in another car), `not_enough_guests`. 403 `forbidden`,
  `premium_required`. 400 rides off / meetup closed.
- The app works out "as many as fit" itself from the meetup it shows. If the car filled up in the
  meantime the server answers `car_full` with the room left; the app shows that message and
  refreshes the meetup, and the rider picks again.

**Consistency (one shared normalizer before every save touching `in`, `rides` or `guests`):**
- Entries for people not In are dropped.
- Seats with a driver who is no longer an In driver are released (rider and guests).
- Guest seats above the rider's current guest count are trimmed from the last entry.
- Safety net: if a car is still over capacity, people are released last-in-first-out (array order;
  every placement moves the entry to the end).
- A driver can't set seats below their current load: 409 `seats_in_use`.

**Auto-assign** (server, managers only, one save):
1. Build parties from unplaced people: a rider without a car plus their unplaced guests; or, for a
   rider who has a car, their unplaced guests alone (they prefer the rider's car if it has room).
2. Largest party first, then rider id.
3. For each party, among cars with room: the nearest one (straight-line miles between zip centers,
   using the rider's zip) that fits the whole party. Drivers with unknown zips count as farthest.
   Ties: most open seats, then driver id. Riders with unknown zips go after all known ones, into the
   car with the most open seats.
4. **If no car fits the whole party, split it** (owner's rule): fill the nearest car with room
   (rider first), then the next nearest, until everyone is placed or no seats remain.
5. Anyone left stays in "Still needs a ride". Response: `{ meetup, placed, unplaced }` (people counts).

**Zip distances.** Bundled table from the Census Bureau's ZCTA Gazetteer (public domain):
`backend/src/data/zipCentroids.json` (`{ "84101": [40.7559, -111.8967] }`, ~33k entries, 4 decimals),
built by `backend/src/scripts/buildZipTable.js`; both committed; loaded on first use. Limits:
straight-line between zip centers; PO-box/business-only zips unknown; 50 states, DC, Puerto Rico.
A user's zip key = its first 5 digits.

**Notifications** (types `ride-assigned`, `ride-removed`; personal, never muted):
- **Rider: every time they or any of their guests lose a seat they had, unless the rider did it
  themselves** (owner's rule). Includes a driver going Out, leaving or being removed from the
  group, being bumped by priority RSVP, switching to "needs a ride", a manager or driver taking
  them out, and guest trimming. Also when someone else places or moves them or their guests.
- Driver: when people join or leave their car, unless the driver did it.
- Auto-assign: one push per rider whose party was placed, one per driver who gained people.
- Bulk paths (leaving/removed from the group, account deletion, priority bumps) now load the
  affected meetups, normalize, save and notify instead of a blind `updateMany`.

**App**
- The Rides part of the meetup's assignments card becomes a list of cars: driver row ("You" when
  it's you, "N open"), then one line per person in the car. Then "Still needs a ride", one line per
  person. The current user's lines are highlighted.
- **Auto-assign rides** button for owners and moderators when someone needs a ride and a car has room;
  result in a toast ("Placed 4 people. 1 still needs a ride.").
- Tapping a person line opens a picker with what the viewer may do: "Ride with Sam (2 open)" for
  each car with room, "Take out of car". Lines the viewer can't change aren't tappable. A rider who
  needs a ride sees "Tap your name to pick a car." Picking a car for a rider who isn't in one brings
  their unplaced guests along; if they don't all fit, the Join anyway / Don't join prompt appears
  (for managers and drivers too). A guest line moves just that guest.
- The guest counter shows the `leave_ride_first` message when blocked.
- Notifications screen text for both types; tapping opens the meetup (existing routing).

**Ship order.** Backend first. Rides exist only on staging, so no 1.3.x users are affected.

## Left to the builder
Exact visual layout of the car and person lines, within the card's styles and dark-mode tokens.
