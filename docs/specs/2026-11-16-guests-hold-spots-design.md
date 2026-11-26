# Guests hold their spots (design)

Small change. Request (Nov 16): owners/moderators can remove a member's guest; when a guest fills
the limit, another member's RSVP never pushes that guest out; owners/moderators remove guests by hand.
Guests count toward the RSVP count and the meetup's limit.

## Already built (Nov 7, tester-feedback-fixes #6/#7)
- `PATCH /api/meetups/:id/guests/:hostClerkId`: owner/moderators lower or clear a member's guests;
  host notified; freed spots go to the waitlist. Tapping a guest tile offers "Remove 1 / Remove all".
- Guests can only be added when there is room.

## Gaps found
1. A host who taps Out and picks **Keep Guests**: the app lists the guests under In and counts them,
   but the server's headcount only counts guests of members who are In, so those spots look free and
   another member's RSVP takes them.
2. A priority bump moves the bumped member *and their guests* to the waitlist.
3. The "Full / Join Waitlist / Priority In" button checks `in.length >= capacity` and ignores guests,
   so the button can read "I'm In" on a meetup that guests have filled.

## Rule (my call, approved as "just dive in")
A guest takes a spot from the moment they're added (already only allowed when there's room) and keeps
it until the host or an owner/moderator removes them, whatever the host does (In, Out, waitlisted,
bumped). Headcount = people In + every guest on the meetup.

Consequences:
- A member's RSVP needs exactly 1 spot (their guests already have theirs). Waitlist promotion and
  priority bumps move one person; bumping someone frees 1 spot and leaves their guests in place.
- Minimum-headcount check uses the same headcount.
- Adding guests: unchanged check (room for the guests, plus the host's own spot if the host isn't In).
- Rides are unchanged (only guests of members who are In get seats).
- Existing meetups where a waitlisted host already has guests may show over the limit until someone
  removes guests; nobody is moved automatically.
