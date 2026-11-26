# Group Details squircle grid — implementation plan

**Goal:** Replace everything below the hero + Next Meetup on Group Details with a 2-wide squircle tile grid; members move to their own page, schedule details to a modal.

**Architecture:** Pure helpers (sorting, subtitles, which tiles show) live in `utils/groupDetailTiles.ts` and are unit-tested. A presentational `SquircleTile` renders each tile. Member grid + DM/timeout/remove logic moves into `GroupMembersList` and a new root route `app/group-members/[id].tsx`. Schedule body moves into `ScheduleDetailsModal`.

**Tech stack:** Expo 54 / RN 0.81, expo-router, TanStack Query, jest-expo + @testing-library/react-native.

**Spec:** `docs/specs/2026-11-18-group-details-grid-design.md`

**Global constraints**
- Tile: `borderRadius: 28`, `borderCurve: 'continuous'`, `aspectRatio: 1`, grid gap 12, two per row.
- Tile order: invite, calendar, meetups, members, schedule, settings. Settings only when owner/moderator. No tiles for DMs.
- Member sort: case-insensitive, `getUserDisplayName`, `localeCompare` with `{ sensitivity: 'base' }`, per section.
- Do not revert uncommitted GroupHeaderTitle work in GroupDetailsScreen / group-chat.
- All commands run from `mobile/`. Full suite: `npx jest`. Types: `npx tsc --noEmit`.

**Review focus**
1. Owner stored as id string vs populated object (`groupDetails.owner` vs `owner._id`) — `canManage` must handle both (test in Task 1).
2. Member with no first/last name → display-name fallback still sorts deterministically (test in Task 1).
3. Meetups for other groups / cancelled / past must not count toward "N upcoming" (test in Task 1).
4. Remove-member and timeout still reachable from the new members page (manual check, Task 6).
5. DMs: no grid, members still shown, no settings tile leak (test in Task 1 via `buildDetailTiles`).

## File map
- Create `mobile/utils/groupDetailTiles.ts` — pure helpers.
- Create `mobile/utils/__tests__/groupDetailTiles.test.ts`.
- Create `mobile/components/ui/SquircleTile.tsx` + `mobile/components/__tests__/SquircleTile.test.tsx`.
- Create `mobile/components/ScheduleDetailsModal.tsx` + `mobile/components/__tests__/ScheduleDetailsModal.test.tsx`.
- Create `mobile/components/GroupMembersList.tsx` (sections + tiles, moved from GroupDetailsView).
- Create `mobile/app/group-members/[id].tsx` (screen; DM sheet + timeout moved from GroupDetailsScreen).
- Modify `mobile/app/_layout.tsx` (register route), `mobile/components/GroupDetailsView.tsx`, `mobile/components/GroupDetailsScreen.tsx`.

## Task 1 — helpers
**Interfaces (produces):**
- `type DetailTileKey = 'invite' | 'calendar' | 'meetups' | 'members' | 'schedule' | 'settings'`
- `buildDetailTiles(opts: { isDM: boolean; canManage: boolean }): DetailTileKey[]`
- `isGroupManager(group: { owner: any; moderators?: any[] }, userId?: string): boolean`
- `sortMembersByName<T extends User>(members: T[]): T[]` (new array)
- `upcomingMeetupCount(meetups: Meetup[] | undefined, groupId: string, now: number): number`
- `scheduleSummary(schedules: GroupDetails['schedules']): string`

- [x] Write tests: `buildDetailTiles({isDM:false,canManage:true})` → all six in order; `canManage:false` → no `settings`; `isDM:true` → `[]`. `isGroupManager` true for owner as string and as `{_id}`, true for moderator, false otherwise. `sortMembersByName` on `["bob","Alice","carl"]` → `Alice, bob, carl`, input not mutated. `upcomingMeetupCount` ignores other group, `cancelled`, past. `scheduleSummary([])` → `"Not set"`; one active schedule, one weekly routine → `"Weekly"`; two active → `"2 schedules"`; inactive (`active:false`) ignored.
- [x] `npx jest groupDetailTiles` → FAIL (module not found).
- [x] Implement in `utils/groupDetailTiles.ts` (frequency label via `FREQ_LABELS`, `biweekly` → "Every 2 Weeks" to match current UI).
- [x] Run → PASS; run full suite → PASS.

## Task 2 — SquircleTile
**Interface:** `SquircleTile({ icon: keyof typeof Feather.glyphMap; label: string; subtitle?: string; tint: { bg: string; border: string; fg: string }; onPress: () => void; testID?: string })`
- [x] Test: renders label + subtitle; container style flattens to `borderCurve: 'continuous'`, `borderRadius: 28`, `aspectRatio: 1`; press calls `onPress`. (Mock `useThemeColors` as in GroupHeaderTitle.test.)
- [x] Run → FAIL. Implement with `PressableOpacity`, width `'48%'` style hook left to the grid. Run → PASS; full suite.

## Task 3 — ScheduleDetailsModal
**Interface:** `ScheduleDetailsModal({ visible: boolean; onClose: () => void; groupDetails: GroupDetails })`
- [x] Test: with no active schedules shows "No schedule defined"; with one schedule shows its `name` and location text; close button calls `onClose`.
- [x] Run → FAIL. Move `renderScheduleLines` and the schedule body from GroupDetailsView verbatim; pageSheet modal, header "Schedule Details" + close X, `onRequestClose` → `runBackInterceptor()` guard like the meetup modal. Run → PASS; full suite.

## Task 4 — Members list + page
**Interfaces:** `GroupMembersList({ groupDetails; currentUser; isRemovingMember; onRemoveMember(id); onMemberPress?(member) })` — consumes `sortMembersByName`, `isGroupManager`.
- [x] Test (`GroupMembersList.test.tsx`): staff and regular sections each render names A–Z (query order of `getAllByTestId('member-name')`).
- [x] Run → FAIL. Move section + tile rendering out of GroupDetailsView into the component, applying the sort. Run → PASS.
- [x] Create `app/group-members/[id].tsx`: header (back + "Members"), loading/offline/error states copied from GroupDetailsScreen, `GroupMembersList`, and the DM sheet + `ChatTimeoutSheet` + `handleRemoveMember` + `handleSendDM` moved from GroupDetailsScreen.
- [x] Register in `_layout.tsx`: add `'group-members'` to the segments list and `<Stack.Screen name="group-members" options={{ headerShown: false }} />`.
- [x] `npx tsc --noEmit` clean for touched files; full suite PASS.

## Task 5 — Rework Details
- [x] GroupDetailsView: keep hero + Next Meetup. Remove invite row, calendar button, collapsible Details. Render `buildDetailTiles(...)` as a `flexDirection:'row', flexWrap:'wrap', gap:12` grid of `SquircleTile`s (width `'48%'`), wiring each key per spec; host `GroupMeetupsModal` and `ScheduleDetailsModal` state here. DMs: render `GroupMembersList` inline instead of the grid. Leave Group unchanged. Drop now-unused `inviteLinkData` query and `handleInvitePress`.
- [x] GroupDetailsScreen: remove `GroupCalendarButton` and settings gear from the top bar (keep `GroupHeaderTitle`); remove the DM sheet/timeout/remove-member code now owned by the members page; pass through only what GroupDetailsView still needs (`onRemoveMember`/`isRemovingMember` for DM inline list stays harmless — DMs can't remove).
- [x] `npx tsc --noEmit` clean for touched files; full suite PASS.

## Task 6 — Verify
- [x] Reread spec line by line against the code.
- [x] Fresh-eyes review of the diff against the spec.
- [ ] Manual (you, on device): owner view shows 6 tiles; member view 5 + Leave; DM shows no grid; each tile opens the right place; members page sorted, DM sheet/timeout/remove work; dark mode; Android back closes the schedule modal.

No commits until you say — the working tree already has unrelated uncommitted changes.
