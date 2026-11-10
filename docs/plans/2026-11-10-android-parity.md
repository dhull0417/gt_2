# Android parity fixes: plan (2026-11-10)

**Goal:** fix the 9 Android issues in `docs/specs/2026-11-09-android-parity-design.md` plus two create-group bugs, with the owner's decisions below.
**Architecture:** Android back on screens uses a `useAndroidBack(enabled, handler)` hook (BackHandler while focused). Back inside a Modal goes to the Modal's `onRequestClose`, so in-tree overlays inside the meetup sheet register with a small interceptor stack (`utils/backInterceptors.ts`) that the parent Modals consult first.
**Tech stack:** Expo 54 / RN 0.81 / expo-router 6. Jest (jest-expo) for the pure logic.
**Global constraints:** no new packages; no native build; iOS behaviour unchanged except larger tap areas and the keyboard lift.

## Owner decisions (2026-11-10)
- #2: drop search from the time-zone picker; it is a plain list.
- #4: Android back follows the on-screen arrow (poll → list).
- #5: back from Group Details opened from chat returns to the chat.
- #6: going back from a code step keeps everything entered on the previous step.
- Bonus: Create Group keeps the typed name (and photo) when going back to step 1; no white flash between steps in dark mode.

## Review focus
- Back while the cancel-reason sheet is open, from each of the 4 places the meetup sheet opens (Home, chat bar, Group Details, Upcoming Meetups) → closes only the sheet. Test: interceptor unit tests.
- Interceptor registered then unmounted must not swallow later back presses. Test: unregister test.

## Tasks
1. [x] `utils/backInterceptors.ts` + tests (`utils/__tests__/backInterceptors.test.ts`): `pushBackInterceptor(fn): () => void`, `runBackInterceptor(): boolean` (runs newest, returns true if one ran).
2. [x] `hooks/useAndroidBack.ts`, `hooks/useBackInterceptor.ts`.
3. [x] #1 CancelReasonSheet: `behavior="padding"`, registers an interceptor; the 4 parent Modals call `runBackInterceptor()` before closing.
4. [x] #2 OptionPickerModal: remove `searchable`, search input and KAV; scroll the selected row into view; remove the prop at its 3 call sites.
5. [x] #3 group-settings: back returns to main view.
6. [x] #4 PollListModal: `onRequestClose` → list first.
7. [x] #5 Group Details: Android opens Details from chat with `from=chat`; back (hardware and arrow) pops Details and opens the chat.
8. [x] #6 code steps: sign-in, sign-up, phone-login, update-phone use `useAndroidBack` to leave the code step; form state is kept (already lifted).
9. [x] #7 chat thumbnail remove button; #8 member remove badge; #9 hitSlop on small back/close icons.
10. [x] Bonus: `NameScreen` takes `initialName`/`initialImage`; navigation ThemeProvider + backgrounds so no white card shows in dark mode.
11. [x] `tsc --noEmit`, full mobile jest.

## Device checklist (Android unless noted)
- Cancel a meetup from Home: type a reason, keyboard doesn't cover it; back closes only the reason box.
- Time-zone picker in Create Group, Edit Schedule and Add Meetup: plain list, opens at the selected zone.
- Group Settings → Edit Group Info → back returns to Group Settings.
- Polls → open a poll → back returns to the list.
- Chat → header → Details → back returns to the chat; back again goes to Groups.
- Sign in with a 2FA account, sign up with email, phone login, update phone: back from the code step returns to the filled-in form.
- Remove a pending chat photo; remove a member in Group Details (tap the top-right corner of the x).
- Create Group in dark mode (iPhone and Android): no white flash between steps; going back to step 1 keeps the name and photo.
