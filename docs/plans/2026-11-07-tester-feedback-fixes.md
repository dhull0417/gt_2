# Tester feedback fixes — implementation plan

**Goal:** fix the eight tester-reported problems in 1.4 as specified in `docs/specs/2026-11-07-tester-feedback-fixes-design.md`.
**Architecture:** backend rules go into small pure helpers (`utils/waitlist.js`, `utils/priorityRsvp.js`) that the routes call, so they can be unit-tested without Mongo. Mobile logic goes into pure helpers in `mobile/utils/` with jest tests; screens only call them.
**Tech stack:** Express + Mongoose + `node --test` (backend); Expo 54 / React Native, luxon, TanStack Query, jest-expo (mobile).

**Global constraints**
- Files use CRLF line endings; edits keep CRLF.
- Tests run in a local scratch copy (`~/work`, synced from the repo) because reads over the shared folder are too slow: backend `npm test`; mobile `npx jest --ci --no-watchman --forceExit` and `npx tsc --noEmit -p tsconfig.json`.
- Baseline: backend 117/117, mobile jest 105/105, tsc 0 errors. Every task ends with all three green.
- Jump-to-message cap: **20 pages** (50 messages each). Chat loading time limit: **8000 ms**. Highlight flash: **1500 ms**.
- No new native packages. Old (1.3.3) clients must keep working against the new backend.

**Review focus**
1. Guests added while the host is Out, then the host taps In on a full meetup → whole party waitlisted, nobody moves (Task 1 + 2 tests).
2. Priority member with 2 guests, meetup full, one lower-priority member In → no bump (Task 2 test).
3. A meetup at 11:30 PM Mountain viewed from Eastern lands on the next day (Task 4 test).
4. Jump target deleted or older than 1,000 messages → gives up, no endless paging (Task 7 test).
5. Chat where the group never loads → error state after 8 s, not a blank screen (Task 8 test).

## File map
| File | Change |
|---|---|
| `backend/src/utils/waitlist.js` | + `guestRoom()` |
| `backend/src/utils/priorityRsvp.js` | + `chooseBumpVictim()` |
| `backend/src/routes/meetup.route.js` | guests route uses `guestRoom`; new manager route |
| `backend/src/controllers/meetup.controller.js` | priority bump uses `chooseBumpVictim` |
| `mobile/utils/meetupTime.ts` | + viewer-timezone formatters |
| `mobile/utils/chatJump.ts` (new) | jump decision helper |
| `mobile/utils/chatLoadState.ts` (new) | load-gate helper |
| `mobile/components/LinkifiedText.tsx` (new) | tappable links for plain text |
| `mobile/utils/uploadImage.ts` | own cropper on iOS |
| screens listed per task | wiring |

---

### Task 1 — Guest additions need a free spot (backend)
**Files:** `backend/src/utils/waitlist.js`, `backend/src/utils/waitlist.test.mjs`, `backend/src/routes/meetup.route.js`
**Interface:** `guestRoom(meetup, clerkIdByUserId, { hostId, hostClerkId, nextCount }) → { ok: boolean, room: number }`. `room` = spots left for this host's guests. Host's own spot counts when the host is not In. Capacity 0 → always ok.
- [ ] Test `guestRoom refuses guests beyond open spots whether or not the host is In`: capacity 8; 7 In with no guests; host In → nextCount 1 ok, 2 refused (room 1). Host Out → nextCount 1 refused (room 0, the host's own spot uses the last one). Capacity 0 → ok.
- [ ] Run, expect FAIL (`guestRoom` is not exported).
- [ ] Implement; route calls it for every increase (drop the `meetup.in.some(...)` condition), keeps the 409 `meetup_full` body with the new room number.
- [ ] Run all, expect PASS. Commit "Guests can't take spots that aren't free".

### Task 2 — Priority bumps never over-fill (backend)
**Files:** `backend/src/utils/priorityRsvp.js`, `backend/src/utils/priorityRsvp.test.mjs`, `backend/src/controllers/meetup.controller.js`
**Interface:** `chooseBumpVictim(meetup, requesterId, { need, used, capacity, clerkIdByUserId }) → userId | null`. Picks the lowest-priority In member below the requester (same tie rule as today: latest RSVP); returns null unless `used - victimNeed + need <= capacity`, where `victimNeed` = 1 + the victim's guests.
- [ ] Tests: (a) requester alone, full meetup, lower-tier member In → that member; (b) requester with 2 guests, the only lower-tier member has no guests → null; (c) lower-tier member who brings 2 guests frees 3 → bump allowed for requester + 2 guests; (d) nobody lower → null.
- [ ] Run, expect FAIL. Implement; controller replaces its inline loop with the helper (also removes the victim's claims/rides/answers/teams as now).
- [ ] Run all, PASS. Commit "Priority RSVP only bumps when the party fits".

### Task 3 — Managers can remove a member's guests (backend + app)
**Files:** `backend/src/routes/meetup.route.js`, `backend/src/utils/waitlist.js` (+test), `mobile/utils/api.ts`, `mobile/components/MeetupDetailModal.tsx`, `mobile/utils/notificationRouting.ts` (+test)
**Interface:** backend `canEditGuestsOf({ requesterId, hostUserId, group }) → boolean` (self, owner, or moderator; a moderator can't edit the owner's or another moderator's guests, matching `canManageMember`). Route `PATCH /api/meetups/:meetupId/guests/:clerkId` body `{ count }`; only decreases are allowed for someone else (409 otherwise); then `promoteWaitlist`, then notification type `guests-removed` to the host ("Your guests were removed from <name>"), `data.meetupId` set. App: `meetupApi.setGuestCountFor(api, meetupId, clerkId, count)`.
- [ ] Tests: `canEditGuestsOf` — self true, owner true, moderator on member true, moderator on owner false, plain member on other false. Routing test: `guests-removed` opens the meetup.
- [ ] FAIL → implement → PASS.
- [ ] UI: guest tiles and the member sheet show **Remove guests** (confirm alert) when `canManageTarget(host)` or the host is me; on success update the local meetup and invalidate `['meetups']`.
- [ ] tsc + full suites. Commit "Owners and moderators can remove guests".

### Task 4 — Viewer-timezone time helpers (app)
**Files:** `mobile/utils/meetupTime.ts`, `mobile/utils/__tests__/meetupTime.test.ts` (new)
**Interface:**
- `viewerZone(): string` (wraps `deviceTimeZone()`).
- `meetupViewerDayKey(m, zone = viewerZone()) → 'yyyy-LL-dd'` of the start instant in `zone`.
- `formatMeetupTime(m, zone = viewerZone()) → '9:00 PM ET'`, or `'7:00 PM'` when `zone`'s abbreviation equals the group's.
- `formatMeetupDate(m, opts: Intl.DateTimeFormatOptions, zone = viewerZone()) → string` (formats the start instant in `zone`).
- [ ] Tests: 7:00 PM America/Denver on 2026-11-10 viewed in America/New_York → `9:00 PM ET`, day key `2026-11-10`; viewed in America/Denver → `7:00 PM`; 11:30 PM Denver viewed in New York → day key `2026-11-11`, `1:30 AM ET`; missing timezone falls back to the phone zone and shows no abbreviation.
- [ ] FAIL → implement → PASS. Commit "Meetup times in the viewer's timezone (helpers)".

### Task 5 — Use the viewer's timezone on every meetup screen (app)
**Files:** `components/MeetupCard.tsx` (time line), `components/MeetupDayGroups.tsx` (day key + header), `components/MeetupDetailModal.tsx` (header lines ~419, ~731, ~933; edit picker keeps group time and shows group abbreviation), `app/group-chat/[id].tsx` (next-meetup bar), `components/GroupDetailsView.tsx` (next-meetup card), `app/notifications.tsx`, `utils/meetupStatus.ts` (RSVP-open label), `app/group-priority/[id].tsx`.
- [ ] Replace each group-zone date/time format with the Task 4 helpers. Schedule lists in Group Details (routine rules) stay in group time.
- [ ] Extend `utils/__tests__` only where a helper changed (`meetupStatus` label: RSVP opening 9:00 AM Denver reads `11:00 AM ET` in New York).
- [ ] tsc + suites. Commit "Show meetup times in the viewer's timezone".

### Task 6 — Clickable links in meetup descriptions (app)
**Files:** `mobile/components/LinkifiedText.tsx` (new), `components/MeetupCard.tsx`, `components/MeetupDetailModal.tsx`
**Interface:** `<LinkifiedText text style linkColor numberOfLines? />` renders `linkify(text)` segments; link segments call `openLink(kind, value)`, long-press copies (`copyLink`).
- [ ] No new logic to unit-test (`linkify` already tested); tsc. Card: links tappable only in the detail sheet; card keeps plain text so tapping the card still opens it (my call, avoids stolen taps).
- [ ] Commit "Clickable links in meetup descriptions".

### Task 7 — Jump from search (and pins) to the message (app)
**Files:** `mobile/utils/chatJump.ts` (new) + test, `mobile/app/group-chat/search/[id].tsx`, `mobile/app/group-chat/[id].tsx`, `mobile/components/ChatMessageBubble.tsx`, `mobile/components/ChatPinnedMessages.tsx`
**Interface:** `nextJumpStep({ messages, targetId, pagesLoaded, reachedStart, maxPages = 20 }) → 'found' | 'loadMore' | 'tooFar' | 'notFound'` (`notFound` once the start is reached without it; `tooFar` at the cap). Chat route param `jumpTo` (message id). Bubble prop `flash: boolean` (1500 ms highlight).
- [ ] Tests: found when present; loadMore when absent and under cap; tooFar at 20 pages; notFound when reachedStart; a deleted target (present with `deleted_at`) → found (bubble shows "deleted"; toast "That message was deleted").
- [ ] FAIL → implement → PASS.
- [ ] Search results become pressable → `router.navigate({ pathname: '/group-chat/[id]', params: { id, jumpTo } })`. Pinned list items call the same with the modal closing first.
- [ ] Chat: an effect drives `fetchOlder` while the step is `loadMore`, suspends follow-to-bottom, then scrolls with `scrollToLocation` (section + item index, `viewPosition: 0.5`, retry once in `onScrollToIndexFailed`), sets the flash, clears `jumpTo`. `tooFar`/`notFound` → toast.
- [ ] tsc + suites. Commit "Jump to a message from search and pins".

### Task 8 — Chat never stays blank (app)
**Files:** `mobile/utils/chatLoadState.ts` (new) + test, `mobile/app/group-chat/[id].tsx`
**Interface:** `chatLoadState({ hasGroup, hasUser, messagesReady, elapsedMs, limitMs = 8000 }) → { state: 'loading' | 'ready' | 'failed', missing: ('group' | 'your profile' | 'messages')[] }`.
- [ ] Tests: all present → ready; missing group at 7999 ms → loading; at 8000 ms → failed with `['group']`; several missing listed in that order.
- [ ] FAIL → implement → PASS.
- [ ] Chat: a timer starts on mount/Retry; `failed` replaces the loader with "Couldn't load this chat", the missing list in small text, **Retry** (refetch group details, groups, current user, messages; restart timer) and **Back**.
- [ ] tsc + suites. Commit "Show an error with Retry instead of a blank chat".

### Task 9 — Edit dialog always shows Save (app)
**Files:** `mobile/app/group-chat/[id].tsx`
- [ ] Edit input `maxHeight` = `Math.min(200, (windowHeight - keyboardHeight) * 0.35)` using `useWindowDimensions` and `Keyboard` listeners; panel `maxHeight` no longer clips the buttons.
- [ ] UI only; tsc. Commit "Keep Save visible when editing long messages".

### Task 10 — Profile/group photo picking finishes on iPhone (app)
**Files:** `mobile/utils/uploadImage.ts`, `mobile/app/(tabs)/profile.tsx`
- [ ] `pickImageUri`: drop `allowsEditing` on iOS; both platforms call `requestImageCrop(asset.uri, asset.width, asset.height)` (`ImageCropperHost` is already mounted app-wide in `_layout.tsx`).
- [ ] Profile: spinner covers crop→upload; distinct alert "Couldn't read that photo. Try another one." when the picker/cropper fails vs upload failure.
- [ ] tsc + suites. Commit "Use the app's cropper on iPhone".

### Final check
- [ ] Reread the design line by line against the diff; full suites + tsc; fresh-reviewer pass over the whole change.
- [ ] On-device checklist for you (I can't run devices): items 1, 2, 3, 5, 8 on iPhone and Android.
