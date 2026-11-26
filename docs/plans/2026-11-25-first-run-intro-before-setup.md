# Plan: first run, the Meetups tour before account setup

**Goal:** a new account lands on Meetups with no welcome video, sees the Meetups tour, then gets account setup.

**Architecture:**
- A pure function decides where a signed-in person belongs: setup, the tabs for the intro, or the app.
- `app/_layout.tsx` feeds it the person's state, plus what the tours report through `TourGateContext`.
- A 6-second fallback sends someone to setup if the tour never starts.

**Spec:** `docs/specs/2026-11-25-first-run-intro-before-setup-design.md`

**Global constraints:**
- No server changes and no new dependencies.
- The welcome video is switched off with a setting, not deleted.
- No commits; the user commits.
- Tests run in Claude's workspace copy; the files are then copied to the PC after checking that the PC's copies haven't changed.

**Review focus:**
1. **The tour never starts** (offline, an error, or meetups already exist): setup must still open. Test: `decideFirstRun` with `fallbackElapsed` returns `'setup'` (Task 1). Task 3 also has a timer test.
2. **The tour is running:** setup must not open, even though `seenTours` already has the key, because it's marked when the tour starts. Test in Task 1.
3. **The tour was seen on another device, or before an app restart:** setup opens straight away. Test in Task 1.
4. **Sign-out, then a different new account:** the intro state must reset. Test in Task 3 (state keyed by user id).

## Tasks

### Task 1: the first-run decision
- **Files:**
  - `mobile/utils/firstRun.ts`
  - `mobile/utils/__tests__/firstRun.test.ts`
- **Interface:**
  - `decideFirstRun({ hasUser, profileIncomplete, seenIntro, introRunning, introEnded, fallbackElapsed })` returns `'setup' | 'intro' | 'app'`
  - `INTRO_TOUR_KEY = TOURS.meetupsEmpty`
  - `INTRO_FALLBACK_MS = 6000`
- **Rules:**
  - no server user → `'setup'`
  - profile complete → `'app'`
  - otherwise the intro is done when `introEnded || fallbackElapsed || (seenIntro && !introRunning)`: done → `'setup'`, not done → `'intro'`
- [ ] Write failing tests:
  - a new user, no tour yet → `'intro'`
  - tour running (seen already marked) → `'intro'`
  - tour ended → `'setup'`
  - seen on another device, not running → `'setup'`
  - fallback elapsed → `'setup'`
  - no user → `'setup'`
  - complete → `'app'`
- [ ] Run them; expect a fail (module not found).
- [ ] Implement.
- [ ] Run them; expect a pass.

### Task 2: tours report starting and ending
- **Files:**
  - `mobile/contexts/TourGateContext.tsx`
  - `mobile/components/tour/ScreenTour.tsx`
  - `mobile/components/__tests__/ScreenTour.test.tsx`
- **Interface:**
  - `TourGateProvider` gains an optional `onTourEvent?: (key: string, event: 'started' | 'ended') => void`
  - `useTourGate()` returns `{ blocked, reportTour }`, where `reportTour` defaults to doing nothing
  - `ScreenTour` calls `reportTour(tourKey, 'started')` when it starts and `reportTour(tourKey, 'ended')` in `onStop`
- [ ] Write a failing test: in `ScreenTour.test`, wrap the tour in `TourGateProvider` with a mock `onTourEvent`. Running the tour to Done gives the calls `[['groups-empty','started'], ['groups-empty','ended']]`.
- [ ] Run it; expect a fail.
- [ ] Implement.
- [ ] Run the tour tests.

### Task 3: wire the layout; switch the welcome video off
- **Files:**
  - `mobile/components/WelcomeModal.tsx` (`export const WELCOME_VIDEO_ENABLED = false`)
  - `mobile/app/_layout.tsx`
  - `mobile/hooks/useFirstRunIntro.ts` and its test (the state plus the 6-second timer)
- **Interface:**
  - `useFirstRunIntro({ userId, profileIncomplete, inTabs })` returns `{ introRunning, introEnded, fallbackElapsed, onTourEvent }`
  - The state resets when `userId` changes.
  - The timer starts when `userId` is set, the profile is incomplete, the person is in the tabs and the tour isn't running. It's cleared when the tour starts.
- **The layout:**
  - `showWelcomeModal` also requires `WELCOME_VIDEO_ENABLED`
  - `decideFirstRun` drives the routing:
    - `'setup'` and not on `profile-setup` → replace with `/profile-setup`
    - `'intro'` and not in the tabs → replace with `/(tabs)`
    - `'app'` → today's rule (outside the tabs and the allowed routes → go to the tabs)
  - `TourGateProvider onTourEvent={onTourEvent}`
  - `showUpdateNameModal` also requires the profile to be complete
- [ ] Write failing tests for `useFirstRunIntro` with fake timers:
  - the fallback becomes true after 6000ms with no tour
  - a `'started'` event at 1000ms stops the fallback
  - `'ended'` sets `introEnded`
  - a new `userId` resets everything
  - and: `WELCOME_VIDEO_ENABLED` is false
- [ ] Run them; expect a fail.
- [ ] Implement the hook, the setting and the layout wiring.
- [ ] Run `tsc` and the full mobile suite.

### Task 4: verify
- [ ] Run `tsc` and the full suite, and reread the spec.
- [ ] Copy the files to the PC.
- [ ] Update the project doc.
- [ ] Give the user a device checklist: a new email account, a new Apple account, an offline first open, and closing the app mid-tour then reopening.
