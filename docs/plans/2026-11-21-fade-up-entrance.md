# Fade-Up Entrance (Meetups home) — Implementation Plan

**Goal:** Cards, headers and sections on the Meetups home screen rise and fade into view on every screen focus and as they scroll in.
**Architecture:** One reusable `FadeUp` wrapper (Reanimated shared values for opacity/translateY) that animates on mount and replays when a screen-level replay token changes. `FadeUpScreen` bumps that token on each `useFocusEffect` re-focus. The Meetups screen wraps its header sections and list rows.
**Tech stack:** React Native 0.81, Reanimated 4.1, expo-router 6, Jest (jest-expo) + @testing-library/react-native.
**Spec:** `docs/specs/2026-11-21-fade-up-entrance-design.md`

**Global constraints**
- Offset 12px, duration 320ms, `Easing.out(Easing.cubic)`, stagger 50ms, cap index 8 (max delay 400ms).
- Reduce Motion (`useReducedMotion()` true) → opacity 1, translateY 0, no animation.
- The first focus does not bump the token (mount already animates); every later focus does.
- No replay on re-render: only mount or a token change starts an animation.
- Top bar does not animate.

**Review focus**
1. Re-render with new props (RSVP state change) must not restart the animation → test in Task 2.
2. First focus must not double-play → test in Task 3.
3. `FadeUp` with no provider still renders children → test in Task 2.
4. Reduce Motion renders at rest → test in Task 2.
5. Index above the cap clamps to 400ms → test in Task 1.

## File map
- Create `mobile/components/ui/FadeUp.tsx` — `fadeUpDelay`, `FadeUp`, `FadeUpScreen`, `useFadeUpReplay`, constants.
- Create `mobile/components/ui/__tests__/FadeUp.test.tsx`.
- Modify `mobile/app/(tabs)/index.tsx` — drop `FadeInCard`; wrap header sections + rows; wrap screen body in `FadeUpScreen`.

## Task 1: delay helper + constants
**Files:** `mobile/components/ui/FadeUp.tsx`, `mobile/components/ui/__tests__/FadeUp.test.tsx`
**Produces:** `FADE_UP = { offset: 12, duration: 320, stagger: 50, maxIndex: 8 }`, `fadeUpDelay(index?: number): number`.
- [x] Test `fadeUpDelay`: `undefined→0`, `0→0`, `3→150`, `8→400`, `20→400`, `-1→0`.
- [x] Run, expect FAIL (cannot find module `../FadeUp`).
- [x] Implement.
- [x] Run, expect PASS.

## Task 2: `FadeUp` component
**Consumes:** Task 1. **Produces:** `FadeUp(props: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string })`; internal `FadeUpContext` (`{ token: number }`, default `{ token: 0 }`).
Behaviour: shared values start at rest-hidden (opacity 0, translateY 12) unless reduced motion; on mount and whenever `token` changes, reset to hidden then `withDelay(fadeUpDelay(index), withTiming(...))`. Effect deps = `[token]` only.
- [x] Tests (Reanimated mock, `useReducedMotion` mocked):
  - renders children without any provider;
  - reduced motion → flattened style has `opacity: 1` and `transform` translateY 0;
  - re-render with different children/props does not call `withTiming` again (spy count unchanged);
  - token change via a test provider calls `withTiming` again (count increases).
- [x] Run, expect FAIL (`FadeUp` not exported).
- [x] Implement.
- [x] Run, expect PASS.

## Task 3: `FadeUpScreen` + `useFadeUpReplay`
**Consumes:** Task 2's context. **Produces:** `FadeUpScreen({ children })`, `useFadeUpReplay(): () => void`.
Behaviour: holds `token` state; `useFocusEffect` callback skips its first call, then `setToken(t => t + 1)` on every later focus. `useFadeUpReplay` returns the bump function.
- [x] Tests (mock `expo-router` `useFocusEffect` to capture the callback):
  - first focus call leaves `withTiming` count unchanged;
  - second focus call replays (count increases);
  - `useFadeUpReplay()()` replays.
- [x] Run, expect FAIL.
- [x] Implement.
- [x] Run, expect PASS.

**Deviation (approved by spec, missing from plan):** cascade delay counts from when the screen appeared/replayed (`startedAt`), so rows that mount later from scrolling start at once — spec: "rows that mount later from scrolling animate with no delay." Tests added. `FadeUpScreen` wraps only the loaded FlatList so the clock starts when real content appears, not during the skeleton.

## Task 4: Wire up Meetups home
**Files:** `mobile/app/(tabs)/index.tsx`
- Remove `FadeInCard` (and the now-unused `FadeIn` import).
- Wrap the returned content below the top bar in `<FadeUpScreen>` (top bar stays outside).
- List header: `<FadeUp index={0}>` title row, `index={1}` filter pills, `index={2}` hint row, `index={3}` group filter panel and the empty-state box.
- `renderRow({ item, index })`: wrap day headers, the Past Week header and both card types in `<FadeUp index={index + 4}>`.
- [ ] Run the full suite (`npx jest`), expect all PASS.
- [x] `npx tsc --noEmit -p mobile` has no new errors in touched files.
- [ ] Device check (user): first load cascades; tab away/back replays; scroll reveals fade up; RSVP tap and pull-to-refresh do not replay; Reduce Motion on → instant. iOS and Android.
- [ ] Commit.
