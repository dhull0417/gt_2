# Premium Preview ("try it, then upgrade") — Design

Date: 2026-11-21 · Status: draft, awaiting approval · Size: small-to-medium change (mobile only, no backend)

## Intent
Free users currently see locked Premium rows and a short upsell sheet, so they can't see how the
features work or why they're worth paying for. They should be able to set the Premium settings up
fully, then hit a **Premium** button where the confirm button would be, which opens the RevenueCat paywall.

## Where it applies
- Create group, step 2 (`components/create-group/ScheduleScreen.tsx`)
- Add / Edit Meetup (`components/meetup-form/MeetupForm.tsx`, hosted by `AddMeetupWizard` and `MeetupDetailModal`)
- Edit / Create schedule from Group Settings (`app/group-edit-schedule/[id].tsx`)
- Minimum to Meet inside the RSVP rules sheet (`components/schedule/MinimumToMeetField.tsx`)

## Behaviour
- **(user)** Everyone can set up Food/Things to bring, Rides, RSVP Questions and Minimum to Meet, even without Premium.
- **(user)** When the group's owner has no Premium and the draft uses a Premium feature, the confirm button changes:
  - viewer is the group owner → **"Premium"** (star icon, brand colour), opens `/paywall`
  - viewer is not the owner → disabled **"Owner needs Premium"**
- *(my call)* "Uses a Premium feature" means the draft would actually save one: ≥1 bring item, Rides on, ≥1 RSVP question, or a minimum headcount (only counts when RSVP window + deadline are on, as in `scheduleToInput`). A free user using none sees the normal Create/Review/Save.
- *(my call)* Skip on create-group is unchanged.
- *(my call)* A one-line note appears under the Premium section header when not Premium: "Set these up now. Premium is needed to save them." Sheets are otherwise unchanged.
- *(my call)* After a purchase the user returns to the same form with the draft intact; Premium status refreshes and the button reverts to Create/Review/Save. They tap it themselves (no auto-submit).
- The backend gate is unchanged and remains the enforcement. The Premium button never submits, so nothing Premium is sent by a free group.

## Not in this change (non-goals)
- Priority RSVP and the "Manage" RSVP Questions screens for **existing** schedules/meetups stay locked. They save straight to the server on their own screens. Previewing them is phase 2.
- No backend, RevenueCat dashboard or paywall content changes.
- In edit mode of an existing meetup/schedule, the RSVP Questions row stays locked for free users (same reason).

## Approach
Shared pieces, applied to the three forms:
1. `usesPremiumFeatures(draft)` pure helper (in `utils/premiumSection.ts`).
2. `submitMode({ usesPremium, isPremium, isOwner })` → `"confirm" | "upgrade" | "ownerNeeds"` (pure, tested).
3. `useIsGroupOwner(owner)` hook extracted from `UpgradeButton`'s existing logic, reused by it.
4. Footer button in each form renders by `submitMode`. Rows use the real sheets/switches regardless of `isPremium`.

Alternatives rejected: preview mode on server-backed screens (bigger, phase 2); moving Priority/Questions into the main forms (large refactor).

## Risks to verify during build
- Opening `/paywall` from inside the native `Modal` (MeetupForm) must not lose the draft or render behind the modal.
- Premium refresh after purchase must also refresh the group's `isPremium` (group details query), not only `currentUser`.
- Existing tests that assert locked rows for free users must be updated to the new behaviour.

## Left to the builder
Exact copy of the note and the owner-needs label wording, styling of the Premium button inside each footer.
