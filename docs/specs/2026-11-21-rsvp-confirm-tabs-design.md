# RSVP Confirm Tabs (Stuff to bring · Rides · Questions) — Design

Date: 2026-11-21 · Status: approved 2026-11-21 · built 2026-11-21 (uncommitted) · Size: small-to-medium change (mobile + one backend constant)

## Intent
After tapping In, everything a meetup asks of you (items to bring, rides, custom questions)
should come up as one sheet instead of two sheets in a row (home) or only the questions
(meetup page). Answers move off the meetup page and are seen by tapping a person's tile, in the
same tabbed view.

## Behavior
- **(user)** One sheet with up to 3 tabs, one per thing the meetup uses, always in the order
  Stuff to bring → Rides → Questions.
- **(user)** The active tab is lit in a special color. *(my call)* Filled teal (`accentTeal`) with
  white text and a soft glow; inactive tabs are muted on a recessed track.
- **(user)** Every tab but the last has a **Next** button that moves to the next tab; tapping any
  tab also switches to it. The last tab has **Submit**, which saves every tab at once.
- *(my call)* With only one tab the tab bar still shows (it labels the section), and its button is Submit.
- *(my call)* Tab labels: "Bring", "Rides", "Questions" (the full "Stuff to bring" doesn't fit 3-across).
- *(my call)* Required questions still unanswered: Submit is disabled with "Answer the questions
  marked * to submit.", and the Questions tab shows a small orange dot while you're on another tab.
- *(my call)* "Not now" under the button closes without saving (same as today).

## When it pops up
- **(user)** Right after tapping In — on a home card and in the meetup page — when the meetup uses
  any of the three and something is still unpicked (no item/ride chosen yet, or no answers yet).
- *(my call)* Not for the waitlist (same as today). Waitlisted people only ever get the Questions tab
  (they can answer but can't pick items or rides).

## Tapping a tile (meetup page)
- **Your own tile:** opens the sheet to edit your picks. On a past/cancelled meetup, opens it read-only.
- **(user) Someone else's tile:** opens their picks read-only in the same tabs (Next walks the tabs;
  the last tab's button is **Done**), with a **More options** link that opens today's person sheet
  (Message, Remind, Mark In/Out, Edit Assignments, Remove Guests).
- If that person has nothing the meetup asks for (not In/waitlisted, or the meetup uses none of the three),
  the tap opens the person sheet directly, as today.

## Answers
- **(user)** The Questions card (everyone's answers listed per question) is removed from the meetup page.
- **(user)** Text answers are limited to 70 characters, with a counter under the box that starts at
  `0/70` and turns orange at `70/70`.
- **(user)** The server enforces the same limit with the error **"Answer must be 70 characters or less."**
  Older app versions show this text in their "Could not save" alert.
- *(my call)* An existing answer longer than 70 characters is cut to 70 when the sheet opens, so
  re-submitting doesn't fail. Choice answers are unaffected (choices are already ≤ 60).

## Approach (picked: B)
- **A — New standalone sheet with its own pickers.** Rejected: duplicates the item and ride pickers
  that the owner/moderator "Edit Assignments" sheet keeps using, so they'd drift.
- **B — Extract shared pickers, build the tabbed sheet on them.** Picked: `BringPicker`, `RidePicker`
  and `QuestionFields` (plus read-only views) live once and are used by both the new sheet and
  `AssignmentsSheet`.

## Decisions
1. `utils/confirmTabs.ts`: `ConfirmTab = 'bring' | 'rides' | 'questions'`;
   `confirmTabsFor(meetup, userId)` returns the applicable tabs in order;
   `shouldPromptAfterIn(meetup, userId)` decides the pop-up.
2. Shared pickers move out of `MeetupAssignments.tsx` / `MeetupQuestions.tsx` into
   `components/rsvp-confirm/` and are reused by `AssignmentsSheet`.
3. Submit calls `setAssignments` (only if Bring/Rides tabs exist) then `setAnswers` (only if Questions).
   An "item already taken" error jumps back to the Bring tab and refreshes; an answers error jumps to
   Questions and keeps whatever already saved.
4. Home screen: the two-sheets-in-a-row flow (`AssignmentsSheet` then `QuestionsSheet`) is replaced by the one sheet.
5. Meetup page: `MeetupQuestions` card removed; own-tile `AssignmentsSheet` replaced; owner/moderator
   "Edit Assignments" keeps `AssignmentsSheet` (answers can't be filled in for someone else).
6. *(my call)* Code left unused afterwards (`MeetupQuestions.tsx`, and the `MeetupAssignments` default card, which is
   already unused) is deleted, with your OK when the delete prompt comes up.
7. Backend: `MAX_ANSWER_LENGTH` 300 → 70 and the new error text. Mobile exports the same constant from `utils/questions.ts`.

## Non-goals
- No new place that shows everyone's answers to one question side by side (that view goes away with the card).
- No change to how owners edit questions, or to ride car management (`RideCars`).
