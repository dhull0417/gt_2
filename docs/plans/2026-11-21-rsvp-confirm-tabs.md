# RSVP Confirm Tabs — Implementation Plan

**Goal:** One tabbed sheet (Bring → Rides → Questions) after tapping In and when tapping a person's tile; answers capped at 70 characters.
**Architecture:** Pure tab logic in `utils/confirmTabs.ts`. The item, ride and question inputs (and their read-only views) move into `components/rsvp-confirm/` and are shared by the new `MeetupConfirmSheet` and the existing owner/moderator `AssignmentsSheet`. Home and the meetup page swap their current sheets for the new one.
**Tech stack:** Expo / React Native + TypeScript, Jest + @testing-library/react-native (mobile); Node `node:test` (backend).
**Spec:** `docs/specs/2026-11-21-rsvp-confirm-tabs-design.md`

## Global constraints
- Answer limit **70** (`MAX_ANSWER_LENGTH`, same value in `mobile/utils/questions.ts` and `backend/src/utils/rsvpQuestions.js`).
- Server error text exactly: **`Answer must be 70 characters or less.`**
- Counter text `${n}/70`, starts at `0/70`, orange (`#EA580C`) at 70.
- Tab order `bring`, `rides`, `questions`; labels "Bring", "Rides", "Questions".
- Active tab: `colors.accentTeal` fill, white text, `accessibilityState.selected = true`.
- Buttons: `Next` (testID `confirm-next`) on every tab but the last; last tab `Submit` (`confirm-submit`) in edit, `Done` (`confirm-done`) in review.
- Mobile tests: `cd mobile && npx jest <paths>`; types: `npx tsc --noEmit -p .`. Backend: `cd backend && npm test`.

## Review focus (each has a test in the owning task)
1. Existing answer > 70 chars is cut to 70 when the sheet opens (Task 4).
2. "Item already taken" on Submit jumps back to the Bring tab and calls `onStale` (Task 4).
3. Answers fail after items/ride saved → `onUpdated` still gets the saved meetup, sheet stays open on Questions (Task 4).
4. Waitlisted user gets only `['questions']` and no pop-up (Task 2).
5. Single tab → no Next, button is Submit (Task 4).

## Known risk
Earlier Jest runs on this OneDrive folder hit the 3-minute tool limit before printing anything. Run one test file at a time with `--runInBand --cacheDirectory $HOME/jestcache`; if a run still can't finish, stop and report it rather than skipping the run.

## File map
| File | Change | Responsibility |
|---|---|---|
| `backend/src/utils/rsvpQuestions.js` | modify | `MAX_ANSWER_LENGTH = 70`, `ANSWER_TOO_LONG`, `answerTooLong(value)` |
| `backend/src/utils/rsvpQuestions.test.mjs` | create | limit tests |
| `backend/src/controllers/meetup.controller.js` | modify | `setAnswers` uses `answerTooLong` / `ANSWER_TOO_LONG` |
| `mobile/utils/questions.ts` | modify | export `MAX_ANSWER_LENGTH = 70` |
| `mobile/utils/confirmTabs.ts` | create | `confirmTabsFor`, `shouldPromptAfterIn`, `tileTapAction`, `TAB_LABELS` |
| `mobile/utils/__tests__/confirmTabs.test.ts` | create | logic tests |
| `mobile/components/rsvp-confirm/BringPicker.tsx` | create | item checklist + `BringReview` |
| `mobile/components/rsvp-confirm/RidePicker.tsx` | create | driver/rider + seat stepper + `RideReview` |
| `mobile/components/rsvp-confirm/QuestionFields.tsx` | create | text/yes-no/choice inputs with counter + `QuestionsReview` |
| `mobile/components/rsvp-confirm/__tests__/pickers.test.tsx` | create | picker tests |
| `mobile/components/MeetupAssignments.tsx` | modify | `AssignmentsSheet` uses `BringPicker` + `RidePicker`; delete unused default card |
| `mobile/components/MeetupConfirmSheet.tsx` | create | the tabbed sheet |
| `mobile/components/__tests__/MeetupConfirmSheet.test.tsx` | create | sheet tests |
| `mobile/app/(tabs)/index.tsx` | modify | one sheet after In on a card |
| `mobile/components/MeetupDetailModal.tsx` | modify | pop-up after In, tile taps, remove Questions card |
| `mobile/components/MeetupQuestions.tsx` | delete | unused afterwards |

---

### Task 0 — Park the earlier draft
- [x] Move the draft `mobile/utils/confirmTabs.ts`, `mobile/components/MeetupConfirmSheet.tsx` and their two test files into `_hold/rsvp-confirm-draft/`. Revert the draft edits with `git checkout -- mobile/components/MeetupDetailModal.tsx "mobile/app/(tabs)/index.tsx" mobile/components/MeetupQuestions.tsx mobile/utils/questions.ts backend/src/utils/rsvpQuestions.js` (none of these had other uncommitted changes before the draft; recheck `git diff` on each first).
- [x] `npx tsc --noEmit -p .` passes → clean starting point.

### Task 1 — Server answer limit
**Files:** `backend/src/utils/rsvpQuestions.js`, `backend/src/utils/rsvpQuestions.test.mjs`, `backend/src/controllers/meetup.controller.js`
**Produces:** `MAX_ANSWER_LENGTH = 70`, `ANSWER_TOO_LONG = 'Answer must be 70 characters or less.'`, `answerTooLong(value: string): boolean`.
- [x] Test `answer limit`: `answerTooLong('x'.repeat(70)) === false`, `answerTooLong('x'.repeat(71)) === true`, `ANSWER_TOO_LONG === 'Answer must be 70 characters or less.'`.
- [x] Run `node --test src/utils/rsvpQuestions.test.mjs` → FAIL (`answerTooLong` is not exported).
- [x] Implement in `rsvpQuestions.js`; in `setAnswers` replace the length check with `if (answerTooLong(value)) return res.status(400).json({ error: ANSWER_TOO_LONG });`.
- [x] Run → PASS; `npm test` passes.
- [x] ~~Commit~~ (no commits — user: never commit)

### Task 2 — Tab logic
**Files:** `mobile/utils/questions.ts`, `mobile/utils/confirmTabs.ts`, `mobile/utils/__tests__/confirmTabs.test.ts`
**Produces:** `type ConfirmTab = 'bring'|'rides'|'questions'`; `confirmTabsFor(meetup, userId): ConfirmTab[]`; `shouldPromptAfterIn(meetup, userId): boolean`; `tileTapAction(meetup, viewerId, tileUserId, readOnly): 'edit'|'review'|'person'|'none'`; `TAB_LABELS`; `MAX_ANSWER_LENGTH` in questions.ts.
Rules: bring = In && `assignmentsActive` && items > 0; rides = In && `assignmentsActive` && `ridesEnabled`; questions = (In || waitlist) && `questionsActive`. Prompt = not waitlisted && tabs ≠ [] && (assignment tab with no claim/ride yet || questions tab with no answer). Tile: self → tabs ? (readOnly ? 'review' : 'edit') : 'none'; other → tabs ? 'review' : 'person'.
- [x] Tests: order `['bring','rides','questions']` for In; waitlisted → `['questions']`; unused features skipped; no Premium → `[]`; prompt true while anything unpicked, false once all picked, false for waitlist; all four `tileTapAction` outcomes.
- [x] Run → FAIL (module not found).
- [x] Implement → PASS. (no commit — user: never commit)

### Task 3 — Shared pickers, used by AssignmentsSheet
**Files:** `mobile/components/rsvp-confirm/{BringPicker,RidePicker,QuestionFields}.tsx`, `mobile/components/rsvp-confirm/__tests__/pickers.test.tsx`, `mobile/components/MeetupAssignments.tsx`
**Produces:**
- `BringPicker({ meetup, userId, selected: string[], onToggle(id: string) })`, `BringReview({ meetup, userId, isSelf: boolean })`
- `RidePicker({ role: RideRole|null, seats: number, onRole(r: RideRole|null), onSeats(n: number), forName?: string })`, `RideReview({ meetup, userId, viewerId })`
- `QuestionFields({ questions, values: Record<string,string>, onChange(id, v) })`, `QuestionsReview({ meetup, userId })`
Markup and styles are moved from today's `AssignmentsSheet` / `QuestionsSheet`, not redesigned.
- [x] Tests: full item shows "Already taken" and is disabled; tapping an item calls `onToggle('i1')`; tapping the selected role calls `onRole(null)`; text field shows `0/70`, typing 90 chars calls `onChange` with 70 chars and the counter reads `70/70`; reviews show "Chips", "Needs a ride", "Vegan", and "No answer".
- [x] Run → FAIL (modules not found).
- [x] Implement; switch `AssignmentsSheet` to `BringPicker` + `RidePicker`; delete the unused default `MeetupAssignments` card.
- [x] Run → PASS; `tsc` passes. (no commit — user: never commit)

### Task 4 — MeetupConfirmSheet
**Files:** `mobile/components/MeetupConfirmSheet.tsx`, `mobile/components/__tests__/MeetupConfirmSheet.test.tsx`
**Consumes:** Task 2 + Task 3. **Produces:** default export `MeetupConfirmSheet({ visible, meetup, currentUserId, onClose, mode?: 'edit'|'review', subject?: {id,name}, onUpdated?, onStale?, onMoreOptions? })`; renders nothing when `confirmTabsFor` is empty.
- [x] Tests: Next walks bring→rides→questions with the lit tab following; tapping a tab switches; Submit sends `setAssignments({bring, ride})` then `setAnswers` and closes; single-tab meetup has no Next (focus 5); 100-char saved answer opens as 70 (focus 1); `item_full` → Bring tab selected, `onStale` called, sheet open (focus 2); `setAnswers` rejects → `onUpdated` called with assignments result, Questions tab selected, sheet open (focus 3); required unanswered → Submit disabled + hint; review mode shows Done, no inputs, More options calls `onMoreOptions`.
- [x] Run → FAIL. Implement → PASS. (no commit — user: never commit)

### Task 5 — Home screen
**Files:** `mobile/app/(tabs)/index.tsx`
- [x] Replace `assignmentsMeetup` / `questionsMeetup` / `pendingQuestions` with `confirmMeetup`; after In, `if (shouldPromptAfterIn(updated, me)) setConfirmMeetup(updated)`; render `MeetupConfirmSheet` (unmounted when closed). Drop unused imports.
- [x] `tsc` passes (logic is covered by Task 2/4 tests). (no commit — user: never commit)

### Task 6 — Meetup page
**Files:** `mobile/components/MeetupDetailModal.tsx`, delete `mobile/components/MeetupQuestions.tsx`
- [x] After In: `shouldPromptAfterIn` → open own sheet. Remove `questionsSignal` and the `<MeetupQuestions>` card.
- [x] Tiles use `tileTapAction`: 'edit' → own sheet; 'review' → review sheet (More options → close, then person sheet after 350 ms, as other sheet hand-offs do); 'person' → person sheet; 'none' → plain view.
- [x] Owner/moderator "Edit Assignments" still opens `AssignmentsSheet`.
- [x] Delete `MeetupQuestions.tsx` (ask for delete permission; if declined, move to `_to_delete/`). `tsc` passes. (no commit — user: never commit)

### Task 7 — Verify
- [x] Full mobile Jest suite, backend `npm test`, `tsc` — all pass (report any run that can't finish).
- [x] Reread spec line by line against the code; fresh-eyes review of the diff by a subagent.
- [ ] Manual check on device: In on a card with all three → three tabs, Next, Submit; tap another member's tile → review + More options; 71st character blocked.
