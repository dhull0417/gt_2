# Empty-screen tours, and removing sample groups

Date: 2026-11-25. Status: draft, awaiting approval.

## Intent

1. Run the first-visit spotlight tour already built for Group Details on two more screens, only when they are empty:
   - the **Meetups tab**, when the person has **no meetups at all** (`meetups.length === 0`)
   - the **Groups tab**, when the person has **no groups**

   The point is to show a brand-new person where to start.
2. **Remove sample groups completely** before the move to production:
   - the "or look around a sample group" link
   - the client API call
   - the server endpoint
   - the `isDemo` flag
   - every sample group, with its meetups and chat, that already exists

   This is a testing environment, so deleting sample groups that turned into real groups is fine (user's decision).

## Goals

- Each empty-screen tour plays once per person, tracked in `user.seenTours`, as on Group Details. While `TOURS_ALWAYS_SHOW` is on, it plays on every visit.
- A tour never starts while the welcome video or the "update your name" prompt is showing. It starts once they close.
- Nothing in the app or on the server can create a sample group any more.
- Every existing sample group is deleted as thoroughly as when its owner taps "Delete group", including its chat in Supabase.

## Non-goals

- No tours on other screens yet.
- No change to the Group Details tour.
- No other changes to the wording or layout of the empty screens, beyond removing the sample-group link.

## Anti-goals

- Don't show a tour on top of the welcome video or the name prompt.
- Don't show the Meetups tour to someone who has meetups but has hidden them with the filter, or whose RSVP filter shows nothing. Only "no meetups at all" counts as empty.
- Don't leave orphaned sample-group data behind: chat in Supabase, meetups, notifications, or group ids on users.

## Decisions

### Tours (Claude's calls unless marked)

- **Steps.** Proposed by Claude; the user approved the Meetups list and asked for the sample step to be dropped from Groups.
  - Meetups tab, empty: (1) the **Create a group** button in the empty card, (2) the **⊕** at the top right (add a meetup or group), (3) the **RSVP filter row**, (4) the **bell** (notifications).
  - Groups tab, empty: (1) **Create a group**, (2) **Have an invite code?**, (3) the **⊕** at the top right.
  - Tooltip wording: drafted by Claude in `utils/emptyScreenTours.ts`, for the user to edit.
- **Tour keys:** `meetups-empty` and `groups-empty`.
- **Highlight shapes.** Each step gets its own shape, using the existing `squirclePath` with a per-step corner radius:
  - buttons: a rounded pill matching the button's own radius, plus padding
  - header icons: a circle, using radius = half the size, with circular corners
  - text links: a rounded rectangle
- **Tooltip colour.** These targets aren't coloured tiles, so `TourTip` takes the brand colour (`colors.brand`, with a light tint for the icon chip) instead of a tile tint. Each step names a Feather icon for the chip.
- **Glow.** The pulsing `TourGlow` is reused on each target, with that target's corner radius and the brand colour.
- **No scrolling needed.** These targets are all at the top of a non-scrolling empty screen. `scrollIntoView` isn't used.
- **Waiting for the welcome video and the name prompt.**
  - The root layout (`app/_layout.tsx`) provides a small `TourGateContext` with `blocked = showWelcomeModal || showUpdateNameModal`.
  - `useScreenTour` treats `blocked` as "not enabled", so the start timer is cancelled while blocked and runs once it clears. The existing `useFocusEffect` re-runs when `enabled` changes.
  - Outside a provider, the default is `blocked: false`, so Group Details and tests behave as before.
- **When "empty" is decided.** Only after the list has loaded successfully: not while loading, offline or in an error state, which already show other screens.
  - The tour overlay blocks taps, so a person finishes or skips it before acting on the screen.
  - If they become empty again later, a seen tour does not replay, apart from in testing mode.

### Sample-group removal

- **Approach (user's choice):** a one-off script, `backend/src/scripts/deleteSampleGroups.js`, which reuses the app's own group deletion.
  - The cleanup body of `deleteGroup` (meetups, polls, invite tokens and events, pending invites, attendance, tournaments, notifications, `$pull` from members' user records, the group itself, then `purgeGroupChat`, `removeAllChatMembers` and `deleteGroupChatTimeouts`) moves into `backend/src/utils/groupCleanup.js` as `deleteGroupAndData(group)`.
  - `deleteGroup` calls the helper and keeps its permission check and its "Group Deleted" notification to other members, so its behaviour is unchanged.
  - The script calls the helper for each sample group, and sends no notifications (user's decision).
- **Script behaviour:**
  - `node src/scripts/deleteSampleGroups.js` is a **dry run**. It prints the number of sample groups (`isDemo: true`), how many have members besides the owner, and how many meetups would go.
  - `node src/scripts/deleteSampleGroups.js --apply` deletes them all, one group at a time, logging each one, and prints a summary.
  - The user runs it on the testing environment now, and on production only if any sample groups exist there.
- **Server endpoint.** `POST /api/groups/demo` stays, but only to answer older app builds:
  - it returns `410 Gone` with `{ error: "Sample groups are no longer available. Create a group or use an invite code." }`
  - older apps show `error` in a toast
  - it creates nothing
  - `createDemoGroup` is replaced by a tiny `sampleGroupsRemoved` handler, which can be deleted once no old builds remain
- **Model:** `isDemo` is removed from `group.model.js` after the cleanup.
  - Order matters: the script queries `isDemo` through the raw collection (`Group.collection`), so it still works once the schema field is gone.
  - Mongoose ignores the unknown field on any leftover document.
- **Lifecycle email:** the `isDemo: { $ne: true }` filter in `utils/email/lifecycle.js` is removed.
- **App:**
  - remove `handleTrySample`, `creatingSample` and the "or look around a sample group" link from the Groups tab
  - remove `groupApi.createDemoGroup` from `utils/api.ts`
  - remove any test references

## Constraints

- No native build changes; everything ships over the air plus a backend deploy.
- **Deploy order:**
  1. backend (the endpoint returns 410, `seenTours` already exists)
  2. run the script with `--apply`
  3. ship the app update
- The `TOURS_ALWAYS_SHOW` testing switch stays on until the user turns it off before release.
- Jest stalls on the OneDrive folder, so verification runs in Claude's workspace copy.

## Approaches considered

| | Picked? | Why |
|---|---|---|
| One-off script reusing the delete cleanup | ✅ | Removes chat in Supabase too, has a dry run, and stays in step with the real delete |
| migrate-mongo migration | ✗ | MongoDB only (Supabase chat would be orphaned), and no dry run |
| Leave existing sample groups | ✗ | The user wants them gone |

## Left to the builder

- The exact `padding` and radius for each target.
- The exact tooltip wording, which the user will edit.
- How to share the tour plumbing between screens: likely a small `useEmptyScreenTour` or per-screen setup modelled on `GroupDetailsView`.
