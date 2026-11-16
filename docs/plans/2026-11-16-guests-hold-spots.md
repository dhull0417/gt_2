# Guests hold their spots: plan

Goal: guests count toward the limit no matter what their host does; only the host or an owner/moderator removes them.
Architecture: one headcount rule (people In + all guests) used by the server (waitlist, RSVP, priority, minimum)
and the app (Full button, priority button). Spec: docs/specs/2026-11-16-guests-hold-spots-design.md
Tech: Node test runner (backend, `node --test --test-force-exit`), Jest (mobile).
Review focus: Out host with kept guests then another member taps In on a meetup that's full only because of
those guests -> waitlisted, not In (task 2).

- [ ] 1. `backend/src/utils/waitlist.js`: `headcountOf` = in.length + all guest counts; `guestRoom` always
      subtracts the host's current guests. Tests in `waitlist.test.mjs`: Out-host guests count; guestRoom for an Out host with kept guests.
- [ ] 2. `promoteWaitlist` need = 1; `meetup.controller.js` RSVP `myNeed` = 1. Test: promotion of a waitlisted host
      with guests needs only 1 spot (unit-level via headcount); RSVP path covered by review.
- [ ] 3. `backend/src/utils/priorityRsvp.js`: bump frees 1 spot and the requester needs 1; `rebalanceMeetup` the same.
      Update `chooseBumpVictim` tests (b)/(c).
- [ ] 4. `backend/src/utils/minimumHeadcount.js`: same headcount. Test.
- [ ] 5. Mobile: `meetupHeadcount` in `mobile/utils/meetupStatus.ts`; `isFull` in MeetupCard/MeetupDetailModal and
      `canPriorityBump` use it. Jest test for `meetupHeadcount` and `canPriorityBump` with guests.
