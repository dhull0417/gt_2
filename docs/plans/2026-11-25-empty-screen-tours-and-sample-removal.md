# Plan: empty-screen tours, and removing sample groups

**Goal:** first-visit spotlight tours on the empty Meetups and Groups tabs, and sample groups removed from the app, the server and the data.

**Architecture:**
- **Backend:** the group-deletion cleanup moves into one shared helper, used by the "Delete group" endpoint and by a one-off script that deletes every sample group.
  - The sample endpoint now only answers older apps with a 410.
  - The `isDemo` flag goes.
- **App:** the existing tour pieces get small generalisations:
  - `useScreenTour` waits on a `TourGateContext` provided by the root layout
  - `TourTip` and `TourGlow` take a brand-coloured tint
  - each step can have its own highlight shape

  The two tab screens wrap their targets in `AttachStep`.

**Tech stack:**
- Express and Mongoose; backend tests use `node:test` (`*.test.mjs`)
- Expo SDK 58 and React Native 0.88, with Jest (`jest-expo`) and RNTL
- `react-native-spotlight-tour` 4.0.0, patched

**Spec:** `docs/specs/2026-11-25-empty-screen-tours-and-sample-removal-design.md`

## Global constraints
- No commits unless the user asks; the user commits.
- Tour keys are `meetups-empty` and `groups-empty`. They must match `/^[a-z0-9]+(-[a-z0-9]+)*$/` and be 40 characters or fewer.
- `TOURS_ALWAYS_SHOW` stays `true`.
- **The 410 message is exactly:** `Sample groups are no longer available. Create a group or use an invite code.`
- The script is a dry run unless `--apply` is passed, and sends no notifications.
- No native changes and no new dependencies.
- Verification runs in Claude's workspace copy, then the files are copied to the PC.

## Review focus
1. **The welcome video is open on an empty Meetups tab.** The tour must not start; it starts after the video closes. Test: `useScreenTour` with `TourGateContext blocked=true` doesn't start, then starts when it flips to false (Task 5).
2. **The Meetups list is still loading, or failed.** No tour. Test: `meetupsEmptyTourEnabled({ loaded: false, … })` returns false (Task 5).
3. **Meetups is empty only because of the filters.** No tour. Test: `meetupsEmptyTourEnabled` is false when `meetups.length > 0`, whatever the filters (Task 5).
4. **"Delete group" still notifies the other members after the refactor.** Test in Task 1.
5. **The script, once `isDemo` is gone from the schema, must still find the sample groups.** It queries the raw collection. Test in Task 3.

## File map

| File | Change | Responsibility |
|---|---|---|
| `backend/src/utils/groupCleanup.js` | new | `deleteGroupAndData(group)`: everything a deleted group leaves behind |
| `backend/src/utils/groupCleanup.test.mjs` | new | |
| `backend/src/controllers/group.controller.js` | modify | `deleteGroup` uses the helper; `createDemoGroup` becomes `sampleGroupsRemoved` (410) |
| `backend/src/routes/group.route.js` | modify | `/demo` points to `sampleGroupsRemoved` |
| `backend/src/models/group.model.js` | modify | remove `isDemo` |
| `backend/src/utils/email/lifecycle.js` | modify | remove the `isDemo` filter |
| `backend/src/scripts/deleteSampleGroups.js` | new | CLI: dry run, or `--apply` |
| `backend/src/scripts/sampleGroups.js` | new | `findSampleGroups(collection)`, `summarize(groups, meetupCounts)`, `deleteAll(groups, deleteFn, log)`, kept testable |
| `backend/src/scripts/sampleGroups.test.mjs` | new | |
| `mobile/app/(tabs)/groups/index.tsx` | modify | remove the sample link; add the tour |
| `mobile/utils/api.ts` | modify | remove `createDemoGroup` |
| `mobile/contexts/TourGateContext.tsx` | new | `TourGateProvider` and `useTourGate()`, with default `{ blocked: false }` |
| `mobile/app/_layout.tsx` | modify | provide `blocked = showWelcomeModal \|\| showUpdateNameModal` |
| `mobile/hooks/useScreenTour.ts` | modify | treat `blocked` as disabled |
| `mobile/utils/screenTours.ts` | modify | add the `meetupsEmpty` and `groupsEmpty` keys |
| `mobile/utils/emptyScreenTours.ts` | new | the step text and icons for both tours; `meetupsEmptyTourEnabled` and `groupsEmptyTourEnabled` |
| `mobile/components/tour/TourTip.tsx` | modify | none (the tint is already a prop); callers pass a brand tint |
| `mobile/components/tour/brandTint.ts` | new | `brandTourTint(colors, isDark)`, returning a `SquircleTint` |
| `mobile/app/(tabs)/index.tsx` | modify | add the tour |

## Tasks

### Task 1: Backend, the shared group-deletion helper
- **Files:**
  - `utils/groupCleanup.js`
  - `utils/groupCleanup.test.mjs`
  - `controllers/group.controller.js` (`deleteGroup`)
- **Interfaces:** produces `deleteGroupAndData(group: { _id, members: ObjectId[] }): Promise<void>`. It doesn't notify anyone and doesn't check permissions.
- [ ] Write a failing test, `groupCleanup.test.mjs`, with the models and Supabase utilities stubbed in the same way as `syncUser.handlers.test.mjs`.
  - **Test:** "deleteGroupAndData removes the group's data and the group".
    - Assert `deleteMany` is called with `{ group: id }` on Meetup, Poll, AttendanceRecord and Notification, and with `{ groupId: id }` on InviteToken, PendingInvite and InviteEvent.
    - Assert `User.updateMany` uses `$pull.groups === id`, then `Group.findByIdAndDelete(id)`.
    - Assert `purgeGroupChat(id)`, `removeAllChatMembers(id)` and `deleteGroupChatTimeouts(id)` are called.
  - **Test:** "deleteGroup still notifies other members with Group Deleted". Owner u1 and member u2: `notifyAndPersist` is called once, with type `'group-deleted'` and u2 as the only recipient.
- [ ] Run `node --test --experimental-test-module-mocks src/utils/groupCleanup.test.mjs`. Expect a fail: cannot find module `./groupCleanup.js`.
- [ ] Implement: move the cleanup lines out of `deleteGroup` into the helper unchanged. `deleteGroup` keeps its lookup, its 403 check, `others`, and the notification.
- [ ] Run the test; expect a pass. Run the full backend suite.

### Task 2: Backend, the sample endpoint returns 410; remove `isDemo`
- **Files:**
  - `controllers/group.controller.js`
  - `routes/group.route.js`
  - `models/group.model.js`
  - `utils/email/lifecycle.js`
  - test: `controllers/sampleGroupsRemoved.test.mjs`
- [ ] Write the failing tests:
  - "POST /demo answers 410 with the removal message": call `sampleGroupsRemoved`, expect status 410 and body `{ error: <the exact 410 message> }`. Stub `Group.create` to throw if called.
  - "the Group schema has no isDemo": `Group.schema.path('isDemo') === undefined`.
- [ ] Run them; expect a fail: `sampleGroupsRemoved` is not a function.
- [ ] Implement:
  - replace `createDemoGroup` with `sampleGroupsRemoved`, and update the route import
  - delete the `isDemo` field and its comment
  - remove `, isDemo: { $ne: true }` from `lifecycle.js:130`
- [ ] Run the tests and the full backend suite; expect a pass.

### Task 3: Backend, the sample-group cleanup script
- **Files:**
  - `scripts/sampleGroups.js`
  - `scripts/sampleGroups.test.mjs`
  - `scripts/deleteSampleGroups.js`
- **Interfaces:**
  - consumes `deleteGroupAndData` (Task 1)
  - produces `findSampleGroups(groupCollection)`, which returns `Promise<group[]>` using `find({ isDemo: true })` on the raw collection
  - produces `summarize(groups, meetupCountByGroupId)`, which returns `{ groups, withOtherMembers, meetups }`
  - produces `deleteAll(groups, deleteFn, log)`, which returns `{ deleted, failed: [{ id, error }] }`
- [ ] Write the failing tests:
  - "summarize counts groups, groups with members besides the owner, and meetups": 3 groups, one of them with 2 members and 4 meetups, gives `{ groups: 3, withOtherMembers: 1, meetups: … }`.
  - "deleteAll deletes each group and carries on past a failure": the second call throws, so the result has `deleted: 2` and `failed[0].id` set to the second id.
  - "findSampleGroups queries the raw collection for isDemo: true": a fake collection records its filter.
- [ ] Run them; expect a fail (module not found).
- [ ] Implement `sampleGroups.js`, then the CLI `deleteSampleGroups.js`.
  - The CLI follows the pattern of `appVersionReport.js`: `dotenv` and `mongoose.connect`.
  - It prints the summary; it deletes only with `--apply`.
  - It counts meetups with `Meetup.countDocuments` per group.
  - It disconnects in a `finally`.
- [ ] Run the tests and the full backend suite.

### Task 4: App, remove the sample group
- **Files:**
  - `app/(tabs)/groups/index.tsx` (`creatingSample`, `handleTrySample`, the link, and the `ActivityIndicator` import if it becomes unused)
  - `utils/api.ts` (`createDemoGroup`)
- [ ] Write a failing test, `utils/__tests__/noSampleGroups.test.ts`:
  - "groupApi has no createDemoGroup": `expect('createDemoGroup' in groupApi).toBe(false)`.
- [ ] Run it; expect a fail.
- [ ] Implement the removal.
- [ ] Run `tsc` and the test; expect a pass.

### Task 5: App, the tour gate and the empty-screen tour data
- **Files:**
  - `contexts/TourGateContext.tsx`
  - `app/_layout.tsx`
  - `hooks/useScreenTour.ts` and its test
  - `utils/screenTours.ts`
  - `utils/emptyScreenTours.ts`, with a test
  - `components/tour/brandTint.ts`
- **Interfaces:**
  - `useTourGate(): { blocked: boolean }`
  - `TOURS.meetupsEmpty = 'meetups-empty'` and `TOURS.groupsEmpty = 'groups-empty'`
  - `meetupsEmptyTourSteps` and `groupsEmptyTourSteps`: `{ target, title, body, icon, radius }[]`
  - `meetupsEmptyTourEnabled({ loaded, meetups })` and `groupsEmptyTourEnabled({ loaded, groups })`, both returning a boolean
  - `brandTourTint(colors, isDark)`, returning a `SquircleTint`
- [ ] Write the failing tests:
  - `useScreenTour`: "waits while the tour gate is blocked, then starts when it clears". Render inside `TourGateProvider blocked`, advance the delay: no start. Re-render with `blocked={false}`, advance: one start.
  - `emptyScreenTours`:
    - enabled only when loaded and empty
    - false while not loaded
    - false with any meetup or group
    - the steps are in order: `['create-group', 'add', 'filters', 'bell']` and `['create-group', 'invite-code', 'add']`
    - every body is 90 characters or fewer
    - the TOURS keys match the server pattern
- [ ] Run them; expect a fail.
- [ ] Implement:
  - the context (default `{ blocked: false }`)
  - the provider in `_layout.tsx`, wrapping what's inside the auth layout
  - `const enabledNow = enabled && !blocked` in the hook
  - the step data and `brandTourTint`
- [ ] Run the tests and the full mobile suite.

### Task 6: App, wire both tabs
- **Files:**
  - `app/(tabs)/index.tsx`
  - `app/(tabs)/groups/index.tsx`
  - a test: `components/__tests__/emptyTabTours.test.tsx`
- **Interfaces:** consumes everything from Task 5, plus `TourTip`, `TourGlow`, `squirclePath`, `useScreenTour` and the patched `SpotlightTourProvider`.
- **Per screen:**
  - `SpotlightTourProvider` with `steps`, each having its own `shape: { type: 'rectangle', padding: 8, path: r => squirclePath(r, step.radius + 4, Platform.OS === 'ios' && !step.circle) }`
  - `motion="fade"`, `overlayOpacity={0.72}`
  - an `AttachStep index={i}` around each target, with a `TourGlow` active on the current target
  - `onStop` marks the tour as seen
  - `useScreenTour({ key, user: currentUser, enabled, start })`
  - On Meetups, the header bar sits outside the FlatList, so the provider wraps the whole `SafeAreaView` content.
- [ ] Write a failing test: render the Groups `ListEmptyComponent` content with mocks, and assert that three `attach-wrapper-view` test ids exist and that the text "or look around a sample group" is absent.
- [ ] Run it; expect a fail.
- [ ] Implement it for both screens.
- [ ] Run `tsc` and the full mobile suite.

### Task 7: Verify
- [ ] Run the full backend suite, the full mobile suite, and `tsc`.
- [ ] Reread the spec against the diff.
- [ ] Copy the files to the PC.
- [ ] Update the project doc.
- [ ] Give the user the device checklist: empty Meetups, empty Groups, the tours waiting for the welcome video, and the script's dry run, then `--apply`.
