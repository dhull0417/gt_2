# Meetup actions sheet — implementation plan

**Goal:** Replace the ⋯ dropdown in `MeetupDetailModal` with a reusable slide-up `ActionSheet`.
**Architecture:** New presentational `components/ActionSheet.tsx` (RN `Modal`, slide animation, themed via `useThemeColors`, safe-area bottom padding). `MeetupDetailModal` builds an item list and renders `<ActionSheet>`; the anchor/pointer code and `actionsMenu*` styles are deleted.
**Tech stack:** React Native (Expo 54), TypeScript, Jest + jest-expo + @testing-library/react-native.
**Spec:** `docs/specs/2026-11-18-meetup-actions-sheet-design.md`

**Global constraints**
- No new dependencies.
- Backdrop `rgba(0,0,0,0.4)`; sheet top radius 24; handle 40×4 radius 2, `colors.borderStrong`; row height 56, horizontal padding 20, gap 14; icon tile 36×36 radius 10; label 16px weight 600 `colors.textPrimary`; divider `StyleSheet.hairlineWidth` `colors.border`, marginLeft 70; bottom padding `Math.max(24, insets.bottom + 12)`; sheet bg `colors.surface`.
- Row press order: `onClose()` then `item.onPress()`.

**Review focus**
1. Edit row hidden when `canEditOrCancel` is false → manual check as a non-organizer (no unit test: modal too heavy to render).
2. Android hardware back closes the sheet → `onRequestClose={onClose}` asserted in Task 1 test.
3. No divider after the last row → Task 1 test counts dividers.
4. `visible=false` renders no rows → Task 1 test.

## File map
- Create `mobile/components/ActionSheet.tsx` — the sheet.
- Create `mobile/components/__tests__/ActionSheet.test.tsx`.
- Modify `mobile/components/MeetupDetailModal.tsx` — use the sheet, remove anchor logic.
- Modify `mobile/components/meetup-detail/styles.ts` — delete `actionsMenu*` styles.

## Task 1: ActionSheet component
**Files:** create `mobile/components/ActionSheet.tsx`, `mobile/components/__tests__/ActionSheet.test.tsx`
**Produces:** `export type ActionSheetItem = { key: string; label: string; icon: React.ReactNode; iconBg: string; onPress: () => void }` and `export function ActionSheet(props: { visible: boolean; onClose: () => void; items: ActionSheetItem[] })`.

- [x] Write tests (mock `@/contexts/AppearanceContext` → `useThemeColors` with surface/border/borderStrong/textPrimary; mock `react-native-safe-area-context` → `useSafeAreaInsets: () => ({ top:0,bottom:20,left:0,right:0 })`):
  - `renders a row per item` — 3 items → `getByText` each label.
  - `pressing a row closes then runs the action` — shared call log; press "Go to Chat" → log equals `['close','chat']`.
  - `tapping the backdrop closes` — press `testID="action-sheet-backdrop"` → `onClose` called once.
  - `hardware back closes` — `UNSAFE_getByType(Modal).props.onRequestClose()` → `onClose` called.
  - `dividers only between rows` — 3 items → `queryAllByTestId('action-sheet-divider')` length 2.
  - `hidden when not visible` — `visible={false}` → `queryByText` of a label is null.
- [x] Run `npx jest components/__tests__/ActionSheet.test.tsx` → FAIL: cannot find module `../ActionSheet`.
- [x] Implement per global constraints: `Modal transparent animationType="slide" statusBarTranslucent`, backdrop `Pressable` (testID `action-sheet-backdrop`), inner `Pressable onPress={() => {}}` sheet, rows as `PressableOpacity` with `accessibilityRole="button"`, `accessibilityLabel={label}`.
- [x] Run → PASS. Run full `npm test` → PASS.
- [ ] Commit: "Add reusable ActionSheet component". (left for Dalli — git commit in this folder needs delete permission)

## Task 2: Use ActionSheet in MeetupDetailModal
**Files:** modify `mobile/components/MeetupDetailModal.tsx`, `mobile/components/meetup-detail/styles.ts`
**Consumes:** `ActionSheet`, `ActionSheetItem` from Task 1.

- [x] Replace `openActionsMenu` body with `setIsActionsMenuVisible(true)`; delete `actionsMenuAnchor` state, `moreBtnRef` and the button's `ref`; drop `Dimensions` from the import if now unused.
- [x] Build the items inline as a plain array (deviation: no `useMemo`, since the handlers are recreated each render): `edit` (only if `canEditOrCancel`; Feather `edit-2` #F59E0B, bg `isDark ? '#3A2E12' : '#FFFBEB'`), `calendar` (Feather `calendar` #16A34A, `'#132A1E'/'#F0FDF4'`), `chat`, `invite` — icons and bgs copied verbatim from the current menu rows; onPress = `openEditModal`, `handleAddToCalendar`, `handleGoToChat`, `handleInviteToMeetup`.
- [x] Replace the `{/* Actions Menu */}` `<Modal>…</Modal>` block with `<ActionSheet visible={isActionsMenuVisible} onClose={() => setIsActionsMenuVisible(false)} items={actionItems} />`.
- [x] Delete `actionsMenuOverlay`, `actionsMenuCard`, `actionsMenuPointer`, `actionsMenuItem`, `actionsMenuIconWrap`, `actionsMenuLabel`, `actionsMenuDivider` from `meetup-detail/styles.ts`; `grep -rn actionsMenu mobile/` returns only the `isActionsMenuVisible` state.
- [x] `npx tsc --noEmit` (mobile) → no new errors. Full `npm test` → PASS.
- [ ] Commit: "Open meetup actions in a bottom sheet instead of a dropdown". (left for Dalli)

## Task 3: Device check
- [ ] Android: sheet slides up, clears gesture bar, back button closes, each action works, light + dark.
- [ ] iOS: clears home indicator, backdrop tap closes, light + dark.
- [ ] Non-organizer: no Edit row.
