# Offline behavior — design (2026-11-11)

Source review: project doc `claude/offline-behavior-review-2026-11-11.md` (findings O1–O24).
Size: **project** (touches the query client, 6 hooks, 8 screens, 1 backend route). All of it is OTA-safe; no native build needed.

## Intent

With no connection, every action in the app must end in one of exactly two states:
1. **Queued** — accepted immediately, shown as "waiting for connection", persisted across an app kill, sent once in order when the connection returns, with a visible failure if it never lands.
2. **Refused** — fails immediately with "You need an internet connection…", leaves the UI exactly as it was, and never fires later on its own.

Today there is a third state (paused silently, spinner forever, fires unattended later) and several ways for queued work to be lost. This design removes it, modelled on what WhatsApp / Messenger / GroupMe do: content you author queues; account and structural actions refuse.

## Goals
- Correct cold start, resume-after-kill and reconnect behavior for queued work.
- Consistent chat: text, photos, reactions and read-marks all queue.
- Every screen distinguishes "loading", "offline with nothing saved" and "error".
- The offline banner never covers a header or back button.

## Non-goals (this round)
- MMKV / a different persister (needs a native build). AsyncStorage stays; we only shrink what's persisted.
- Queuing message edit, delete, pin/unpin, group mute, profile/zip/phone edits, poll create/cancel. These **refuse** offline. (Edits/deletes could queue later using the same pattern; left out to keep the surface small.)
- Realtime token refresh on long sessions (Android review item; separate).
- Typing indicator, link previews, search while offline (they just don't run).

## Anti-goals
- A second queue/outbox beside React Query's persisted mutations.
- Any change to what a 1.3.x client sends to the backend.

## Decisions

### D1. Two mutation modes, set once
`QueryClient.defaultOptions.mutations.networkMode = 'always'` — every ordinary `useMutation` now sends immediately and fails offline through the existing `onError` alerts. The queued keys opt back in with `networkMode: 'online'` inside their `setMutationDefaults`.

Queued keys (registered defaults, persisted, resumed): `sendMessage` (exists), `rsvp` (exists), `acceptInvite`/`declineInvite` (exist), **`votePoll`**, **`toggleReaction`**, **`markGroupRead`** (new).

Each queued key gets:
- `retry: 2`, `retryDelay: 1000` (sends keep their 6/backoff).
- `scope: { id }` so same-entity mutations run **serially, in order** on resume: `chat:<groupId>`, `rsvp:<meetupId>`, `poll:<pollId>`, `reaction:<messageId>`, `read:<groupId>`, `invite:<notificationId>`.
- **Coalescing** for last-write-wins actions (`rsvp`, `votePoll`, `markGroupRead`): before queuing, remove any *paused* mutation with the same key + entity from the cache. Only the latest intent is sent. Sends and reactions are not coalesced (each is its own event).

### D2. Destructive actions check connectivity before the confirm dialog
Delete group, leave group, remove member, transfer ownership, cancel poll, cancel meetup, delete account: if `onlineManager.isOnline()` is false, show `toast.error("You're offline. Connect to <verb> …")` and don't open the confirm. (`networkMode: 'always'` would already fail them; the guard avoids a confirm that can't succeed.)

### D3. Resume only when a token can be fetched
Remove `resumePausedMutations()` / `m.continue()` from `PersistQueryClientProvider.onSuccess`. A new `useResumeQueuedMutations()` in `AuthLayout` runs once when `isLoaded && isSignedIn && tokenGetterReady && !isRestoring`, and again on every offline→online flip. `authToken.ts` gains `waitForClerkToken(timeoutMs = 5000)` which resolves as soon as the getter is set; `authedApi`'s interceptor and `chatMutations` use it instead of returning null.

`MutationCache.onError` (new) for queued keys: `toast.error` ("Couldn't send your RSVP", "Couldn't send your vote", …), invalidate the owning query (`meetups`, `polls`, `messages`), and for `rsvp` roll back the persisted optimistic card by invalidating. Only `sendMessage` keeps an `error` mutation in the cache (it has retry/discard UI); other queued keys are removed from the cache on error.

### D4. Cold start offline
`AuthLayout`: `currentUserUnavailable = isSignedIn && !currentUser && (fetchStatus === 'paused' || currentUserLoadFailed)`. That state shows the existing "Can't reach GroupThat" overlay (wording: "You're offline. Connect and try again." when paused) and hides the splash. "Try again" refetches when online, toasts when not. `maxAge` of the persisted cache → 30 days. `removeQueries(['currentUser'])` on sign-out stays.

### D5. Paused is not busy
Rule: `busy = isPending && !isPaused`. Applied to `useRsvp` (returns `isBusy`), `MeetupCard`/`MeetupDetailModal` (buttons re-enable, no spinner; a small "Sends when online" caption under the card's RSVP button while a paused RSVP exists for that meetup), notifications Accept/Decline, poll vote button. `useRsvp` replaces its `Alert` with `toast.info("Saved — sends when you're back online")`, once per meetup per offline stretch, and not for admin overrides.

### D6. Pull-to-refresh and retry buttons
Shared `useRefreshOrToast(refetch)`: if offline → `toast.info("You're offline — showing saved data")` and resolve immediately; else await. Used by Home, Groups, Notifications, Group Details, Stats, chat `retryLoad`.

### D7. Offline-empty state everywhere
`utils/offlineState.ts`: `isOfflineEmpty(q) = q.fetchStatus === 'paused' && q.data === undefined`. New `components/OfflineEmptyState.tsx` ("You're offline. Connect to load this." + Try again). Applied to: Home, Groups, Notifications, Group Details (also gets an 8 s timeout → error state like chat), polls list, stats, priority, questions, rankings, tournament. Chat: `chatLoadState` gains a `state: 'offline'` when messages are paused with no cache, rendered as the same empty state in place of the blank thread.

### D8. Banner in flow
`OfflineBanner` becomes a normal `View` rendered above `<Stack>` in `AuthLayout`, with `paddingTop: insets.top`. While it is shown, the subtree below is wrapped in `SafeAreaInsetsContext.Provider` with `top: 0`, so every `SafeAreaView`/`useSafeAreaInsets` consumer stops double-padding. `useContentTopInset` and `OfflineBannerContext` are deleted. Copy: "You're offline — showing saved data" in the app; "You need a connection to sign in" on `(auth)` and `profile-setup`. The one native-header screen (`notifications`) gets `headerTopInsetEnabled: false` while the banner is shown. **My call; device-check item.**

### D9. Chat photos queue
`PendingImage` gains `localUri`. `ChatMessageInput` no longer uploads at pick time; it attaches `{ localUri, width, height }` and sends immediately (all extra photos are queued up front, each its own `sendMessage` under the same `chat:<groupId>` scope so order holds). `sendMessage`'s mutationFn uploads to `chat/<groupId>/<clientId>.jpg` with `upsert: true` (idempotent on retry) and then calls `send_message`. The placeholder bubble renders `localUri`. The input's "uploading" lock goes away.

### D10. Reactions queue
`toggleReaction` registered default: variables `{ messageId, groupId, emoji, userId, senderName, authorId }`; `onMutate` applies the same optimistic toggle `addReaction` does today (moved to a pure helper `applyReactionToggle` in `utils/chatCache.ts`); mutationFn calls `toggle_reaction` (with the legacy fallback) **and then** the backend `chat-reaction` push for added/changed, so the push survives unmount; on error it reapplies only the user's own change inversely (not the whole object). Global `onSuccess` upserts the returned row.

### D11. Read-marks queue
`markGroupRead` registered default, coalesced per group, persisted; global `onSuccess` invalidates `currentUser`. Chat open/close and send-success call it through the mutation. The legacy `last-message` PATCH stays fire-and-forget (it's a no-op once `CHAT_PUSH_MODE=webhook`).

### D12. Persist less
`dehydrateOptions.shouldDehydrateQuery`: persist only `currentUser`, `groups`, `meetups`, `notifications`, `groupDetails`, `polls`, `pins`, `messages`. `messages` are trimmed to the latest 50 on dehydrate (`trimForPersist`). Skip `unreadCounts`, `linkPreview`, search, stats, everything else.

### D13. Network truth
- `NetInfo.configure({ reachabilityUrl: `${API}/api/health`, reachabilityTest: r => r.status === 204, reachabilityShortTimeout: 5s })` — "online" means "can reach GroupThat". Backend gains `GET /api/health` → 204 (no auth).
- Axios timeout: 15 s for GET, 8 s otherwise.
- `getErrorMessage(error, fallback)` returns the offline message only when `!onlineManager.isOnline()` or `error.code === 'ERR_NETWORK'`; a timeout while online says "GroupThat is taking too long to respond. Try again."; a thrown Clerk error offline is treated as offline too.

### D14. Small cleanups folded in
Drop the duplicate send-failure `Alert` in `handleSend` (the failed bubble is the UI). "Still sending…" dialog says "waiting for a connection" only when offline. `fetchOlder` shows a one-time "Connect to load older messages" row when offline. Delete `useContentTopInset`, `OfflineBannerContext`.

## Constraints
- Must not change the `sendMessage` variables shape in a way that breaks a persisted mutation from the current build (new fields optional; `image.url` still honored when present).
- No new native dependencies.
- The working tree holds other uncommitted work in `_layout.tsx`, `MeetupDetailModal.tsx`, `api.ts`, `group-chat/[id].tsx`; edits stay surgical.
- Backend route is additive and safe to deploy first.

## Left to the builder
- Exact toast copy beyond the strings above.
- Whether `OfflineEmptyState` reuses `SkeletonList`'s container styles.
- Jest: mutation-default tests run against a real `QueryClient` with `onlineManager.setOnline(false)`.
