# Meetup actions sheet — design

**Date:** 2026-11-18 · **Size:** small change · **Status:** awaiting approval

## Intent
The circle ⋯ button in `MeetupDetailModal` opens a small dark dropdown card with a pointer arrow, positioned by measuring the button. It feels cramped and tacked-on. Replace it with a slide-up action sheet that matches the sheets used elsewhere in the app and feels native on both Android and iOS.

## Decisions
- **(Dalli)** Bottom sheet, not a floating/context-style menu. It's the Material standard for overflow actions on Android and normal on iOS.
- **(Dalli)** Plain list of actions — no header with meetup title/date.
- **(Dalli)** Approach B: extract a reusable `components/ActionSheet.tsx`; `MeetupDetailModal` passes it the items.
- **(my call)** Same actions, same order, same conditions as today: Edit Meetup (only when `canEditOrCancel`), Add to Calendar, Go to Chat, Invite to Meetup. Same Feather icons and tinted icon colors.
- **(my call)** Sheet follows the theme (`colors.surface`, `colors.textPrimary`, `colors.border` dividers) instead of the current always-dark `#1F2937` card, so it matches the DM sheet in light and dark mode.
- **(my call)** Look: backdrop `rgba(0,0,0,0.4)`, top radius 24, drag handle 40×4 (`colors.borderStrong`), full-width rows ~56px tall, 36px rounded icon tile + 16px semibold label, left-aligned, hairline dividers inset past the icon. Bottom padding `max(24, insets.bottom + 12)` to clear the Android gesture bar / iOS home indicator.
- **(my call)** No "Cancel" row. Closes on backdrop tap and Android back (`onRequestClose`). Handle is visual only, like the existing sheets — no swipe-to-dismiss in this change.
- **(my call)** Tapping an action closes the sheet first, then runs the action (preserves current behavior).
- `animationType="slide"` on the RN `Modal`, same as the DM sheet. No new dependencies.

## ActionSheet API
```ts
type ActionSheetItem = {
  key: string;
  label: string;
  icon: React.ReactNode;      // caller supplies the icon element
  iconBg: string;             // tile background (caller handles dark/light)
  onPress: () => void;
};
type Props = { visible: boolean; onClose: () => void; items: ActionSheetItem[] };
```

## Removals in MeetupDetailModal
`actionsMenuAnchor` state, `moreBtnRef`, the `measureInWindow` math in `openActionsMenu`, and the `actionsMenu*` styles in `meetup-detail/styles.ts` (overlay, card, pointer, item, iconWrap, label, divider). The ⋯ button itself is unchanged.

## Non-goals
Changing which actions exist; adopting the sheet in other screens (possible later); swipe-to-dismiss; `@gorhom/bottom-sheet`.

## Testing
Jest + RNTL test for `ActionSheet`: renders each label, pressing a row calls `onClose` then the item's `onPress`, renders nothing visible when `visible=false`. Manual check on Android (back button, gesture bar, dark mode) and iOS.
