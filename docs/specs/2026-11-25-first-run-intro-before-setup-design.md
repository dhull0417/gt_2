# First run: the Meetups tour before account setup

Date: 2026-11-25. Status: draft, awaiting approval. Size: small change, about 3 tasks.

## Intent

The user's flow for a **brand-new account**:
1. Land on the **Meetups tab**, with no welcome video.
2. The **Meetups tour** plays, because a new account has no meetups.
3. When the tour ends, finished or skipped, **account setup** opens: name and zip, or zip only for Apple sign-ins.
4. After saving, they're in the app as normal. Invite links still open after setup.

The user tested on a device on 2026-11-25: the welcome screen flashed, then account setup replaced it, and the tour never ran.

## What's there today
- `app/_layout.tsx` routing sends anyone with an incomplete profile to `/profile-setup` before the tabs. "Incomplete" means no server user, no zip, or no name for non-Apple accounts.
- `useUserSync` creates the server user, named "New Member", as soon as the person signs in. So the tabs can load, and `seenTours` can be written, before setup.
- `WelcomeModal` shows on the tabs while `hasSeenWelcome` is false.
- A tour counts as seen the moment it starts, a change made earlier on 2026-11-25.

## Decisions
- **Approach (user's choice):** the root layout decides. All the "where should this person be" logic stays in `app/_layout.tsx`.
- **Welcome video switched off (user's choice):** `WELCOME_VIDEO_ENABLED = false` in `components/WelcomeModal.tsx`.
  - `showWelcomeModal` requires it.
  - The component, its videos and `hasSeenWelcome` stay, so it can be switched back on.
- **"Intro pending" (Claude's call):** the server user exists, the profile is incomplete, and the person hasn't finished or skipped the intro in this session (`introDone`).
  - While pending:
    - the routing doesn't send them to setup
    - if they're outside the tabs (for example coming from sign-in), it sends them to `/(tabs)`, which opens on Meetups
- **How the layout learns that the tour has run (Claude's call):**
  - The tour signal from earlier today (`TourGateContext`) gains `reportTour(key, 'started' | 'ended')`. `ScreenTour` reports when its tour starts and ends.
  - The layout keeps `introDone` in local state:
    - it becomes true when the `meetups-empty` tour ends
    - it also becomes true if that tour hasn't started within **6 seconds** of the person being on the tabs, which covers offline, errors and an account that somehow already has meetups
    - it's false whenever a new sign-in begins
  - **Setup opens once `introDone` is true and the profile is still incomplete.** So nobody can get stuck in the tabs without setup, and nobody waits more than about 6 seconds if the tour can't play.
- **A person who has seen the tour on another device**, or reopens the app after the tour but before saving setup, goes straight to setup. The tour is already in `seenTours`, so it won't start, and the 6-second fallback isn't needed: `introDone` is set at once when `meetups-empty` is in `seenTours`.
- **No server user yet** (sync not finished or failed): unchanged. Routing goes to setup, whose Save creates the user.
- **The Apple "add your name" prompt** keeps working, but only appears once the profile is complete. The setup screen is the first stop for that.
- **The tour gate** keeps blocking during the name prompt and the can't-load screen. The welcome video no longer shows, so it no longer blocks.
- **Unchanged:**
  - Invite links still open only after setup.
  - Notification prompts stay contextual (first RSVP, chat or group).
  - The Groups tour still runs the first time the empty Groups tab is opened, which is after setup.

## Non-goals
- No change to the setup screen itself.
- No change to the tour content.
- No server changes.

## Anti-goals
- Never leave someone with an incomplete profile in the tabs indefinitely. The 6-second fallback and "tour ended" both lead to setup.
- Don't show setup over a running tour.

## Approaches considered
| | Picked? | Why |
|---|---|---|
| The root layout decides, told by `TourGateContext` | ✅ | One place for "who must do setup"; the tour code just reports |
| The Meetups screen opens setup when its tour ends | ✗ | Splits the routing rules across two files; the layout still needs its own exception |

## Left to the builder
- The exact name for the context method.
- Whether the 6-second clock starts on the first render of the tabs, or when Meetups gets focus. It must start after the user has loaded.
