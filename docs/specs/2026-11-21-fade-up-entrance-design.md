# Fade-Up Entrance (Meetups home first) — Design

Date: 2026-11-21 · Status: draft, awaiting approval · Size: small change (mobile only), then a mechanical rollout

## Intent
Content currently pops onto screens. Cards, tiles, section headers and sub-sections should
rise slightly and fade into place, so the app feels smoother and more premium. Practice on the
Meetups home screen (`app/(tabs)/index.tsx`), then reuse the same piece across the app.

## When it plays
- **(user)** Every time the screen comes into view: first load, switching back to the tab, returning from a pushed screen/modal route.
- **(user)** Every time new content scrolls into view (virtualized rows fade up as they mount).
- *(my call)* Changing the ALL/UNDECIDED/IN/OUT filter: rows that newly appear fade up (same as today's FadeInCard, plus the rise).
- *(my call)* Never replays for content already on screen: RSVP taps, background refetches, pull-to-refresh stay still.

## How it looks *(my call)*
- Start: opacity 0, translateY +12px → end: opacity 1, translateY 0. 320ms, ease-out cubic, no spring/bounce.
- On screen entry, a top-to-bottom cascade: delay = min(index, 8) × 50ms (max 400ms).
- Rows that mount later from scrolling animate with no delay.
- Top bar (bell / "Meetups" / +) does not animate.
- OS Reduce Motion on → content renders at rest instantly (no animation).

## Scope on Meetups home
"Upcoming Meetups" title row, filter pills row, hint row, group-filter panel, empty-state boxes,
day headers, "Past Week" header, upcoming and past cards. The skeleton → content swap is covered
because the real rows mount fresh.

## Approach (picked: B)
- **A — Reanimated `entering={FadeInDown}` + remount on focus.** Rejected: re-keying the list on
  every tab return resets scroll position and remounts every card.
- **B — Own `FadeUp` wrapper + screen replay signal.** Picked: replays in place, keeps scroll
  position and card state, Reduce Motion handled once, rollout is wrapping + one line per screen.

## Decisions
1. `components/ui/FadeUp.tsx` exports:
   - `FadeUp({ index?, children, style? })` — Reanimated view driving opacity/translateY from a shared value. Animates on mount; replays when the screen's replay token changes.
   - `FadeUpScreen({ children })` — provider that bumps a replay token on each `useFocusEffect` focus (skipping the very first focus, which mount already covers).
   - `useFadeUpReplay()` — returns a `replay()` for screens that need to trigger it manually later.
   - Pure helper `fadeUpDelay(index)` = `Math.min(index, 8) * 50` (no index → 0).
2. A `FadeUp` outside a `FadeUpScreen` still animates on mount (safe to use anywhere).
3. Reduce Motion via Reanimated's `useReducedMotion()`.
4. Meetups home: replace `FadeInCard` with `FadeUp`; list rows pass their list index as `index`
   (so on-screen rows cascade on replay; far-down rows replay invisibly with the capped delay).
   Header sections get indexes 0–3.

## Risk to verify first
`useFocusEffect` must fire on tab re-select with iOS `NativeTabs` and the Android custom tab bar.
The screen already uses `useFocusEffect` (line ~198), so this is expected to work; confirm on device.

## Left to the builder
Exact wrapper placement inside the list header; test mocks for Reanimated/focus.

## Rollout later
Separate spec/plan once the feel is approved on Meetups home.
