# Android parity fixes: design (2026-11-09)

**Intent.** Find places where the app behaves worse on Android than on iPhone, and fix them without changing features. Small change: a batch of targeted fixes, no new dependencies, no native build needed.

**How it was found.** Read-through of `mobile/` (screens, modals, overlays, keyboard handling, touch targets, config), building on `claude/android-review-2026-10-19.md`. Every item below was confirmed in the code. None was reproduced on a device.

## Fixes

| # | Problem on Android | Fix |
|---|---|---|
| 1 | Cancel-meetup reason sheet: keyboard covers the text box and buttons (`behavior` is `undefined` on Android). Android back closes the whole meetup instead of the sheet. | `behavior="padding"` on both platforms (the pattern already used in other sheets); back closes the sheet first. |
| 2 | Searchable option picker (time zones): keyboard covers the list (`behavior` undefined). `clearButtonMode` is iOS-only, so Android has no clear button. | `behavior="padding"` on both; a small clear (x) button on Android. |
| 3 | Group Settings → Edit Group Info / Edit Meetup Schedules: Android back leaves Group Settings instead of returning to its main page. | BackHandler while focused: back returns to the main view. |
| 4 | Polls sheet, viewing one poll: Android back closes the whole sheet; the on-screen arrow returns to the list. | `onRequestClose` goes back to the list first. |
| 5 | Group Details opened from chat: Android back goes to the Groups list; the on-screen arrow and iOS swipe go back to the chat. | Pass `from=chat` when Android opens Details from chat; back then returns to the chat. |
| 6 | Code-entry steps (phone login, sign-in second factor, sign-up email code, update phone): Android back leaves the screen and loses progress. | Back steps out of the code step, like the on-screen back. Shared hook `useAndroidBack(enabled, handler)`. |
| 7 | Chat photo thumbnails: the remove (x) is clipped at the top by the scroll row, and the part outside the thumbnail can't be tapped on Android (touches outside a parent's bounds are dropped). | Pad the row so the x sits inside it; hitSlop toward the inside. |
| 8 | Group Details member remove (x): 20 px, partly outside the avatar, so Android ignores taps on that part. | hitSlop toward the inside of the avatar. |
| 9 | Back/close icons with no padding (24–28 px targets): auth screens, polls sheet, Upcoming Meetups sheet, chat and Group Details headers. | `hitSlop` of 10–12 so each target is about 44–48 px. |

## Non-goals
- No redesign, no new packages, no change to iOS behaviour except larger tap areas and the keyboard lift in items 1–2 (which also helps iOS).

## Noted, not changed
- The app icon and adaptive icon are 326 px (low-res on Android launchers); needs a larger source image.
- `app.json` top-level `notification` key is deprecated (still honoured in SDK 54); can move into the `expo-notifications` plugin config later.
- Create Group's first step has no keyboard lift, so Continue sits under the keyboard on both platforms (dismissed by Done).

## Verification
`npx tsc --noEmit`, mobile jest (a unit test for the `useAndroidBack` hook), backend tests untouched. Device checklist in the plan.
