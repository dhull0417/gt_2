# Meetups tab shows only current groups — design

Size: small change (one backend handler + tests).

## Intent
When a group is deleted, or a person leaves / is removed from it, that group's past
meetups ("Past Week") and cancelled meetups must disappear from that person's Meetups
tab. If they later rejoin, the old past meetups come back.

## Why it happens today
- Leave / remove runs `scrubMemberFromUpcomingMeetups`, which only touches meetups
  with `date >= now`. Past, cancelled-past and in-progress meetups keep the person in
  `members`, and `getMeetups` filters on `members` alone, so they keep being served.
- Group delete already hard-deletes the group's meetups; delta sync drops them via
  `validIds`. Works today — gets a regression test only.

## Decision
`getMeetups` (full fetch **and** `?since=` delta sync, including `validIds`) returns a
meetup only if the person is in its `members` **and** is currently in the group's
`members`. Membership is read from `Group.members` (the source of truth), not
`User.groups`.

## Approaches considered
- **Filter on current membership (picked).** Non-destructive: other members' history,
  stats and past-meetup details are untouched; existing stale data is fixed with no
  migration; rejoining restores visibility (the user's explicit requirement).
- Pull the person from past meetups' `members` on leave/remove. Rejected: rejoining
  would not bring them back, and it needs a migration for existing data.
- Client-side filter by the groups list. Rejected: fragile, server keeps sending data.

## Goals / non-goals
- Goal: removed/left/deleted groups' meetups (any status, any date) vanish from the tab.
- Goal: rejoin restores past meetups that still exist (server keeps ~10 days).
- Non-goal: changing the group's own Past Meetups screen, stats, or attendance records.
- Non-goal: mobile changes. The removed person's device already refetches on the group's
  realtime `updated` broadcast and on focus; delta sync drops ids missing from `validIds`.

## Builder's call
- Implementation shape: one `Group.find({ members: user._id }).distinct('_id')` and add
  `group: { $in: ids }` to the meetup filter (my call).
