# Offline behavior — implementation plan (2026-11-11)

**Goal:** every action offline either queues reliably or refuses immediately; no screen spins forever or shows an empty state when it is merely offline.
**Architecture:** React Query stays the only queue. Ordinary mutations switch to `networkMode: 'always'`; the queued set (`sendMessage`, `rsvp`, `acceptInvite`, `declineInvite`, `votePoll`, `toggleReaction`, `markGroupRead`) keeps `'online'` with registered defaults, per-entity `scope`, coalescing and a global `onError`. Resume moves behind "a Clerk token is obtainable". Screens get a shared offline-empty state and the banner moves in flow.
**Tech stack:** Expo 54 / React Native, `@tanstack/react-query` 5.101, `react-query-persist-client`, NetInfo 11.4, Supabase JS, jest-expo. Backend: Express on Vercel.
**Spec:** `docs/specs/2026-11-11-offline-behavior-design.md`.

**Global constraints**
- `cd mobile && npx tsc --noEmit` clean after every task.
- Mobile tests: `cd mobile && npx jest <path>` for the task's suite; full `npm test` at the end (owner's machine — OneDrive mount is slow here).
- Backend: `cd backend && npm test` must stay green (currently all passing).
- No new dependencies. No changes to persisted `sendMessage` variable shapes except optional additions.
- Commit after each task on `staging` with message `offline: <task title>` (git delete-lock caveat: if `.git/*.lock` errors appear, stop and tell the owner).

**Review focus** (spec implications with no obvious test — each has a test in the owning task)
1. A paused `rsvp` for meetup A must not be removed when a new `rsvp` for meetup B is queued (Task 3).
2. `trimForPersist` must keep the *newest* 50 messages, not the oldest (Task 10).
3. `getErrorMessage` on an axios timeout while online must not say "no internet" (Task 11).
4. `chatLoadState` must report `offline` only when there is no cached thread, not merely when offline (Task 7).
5. Resume must not run before the token getter exists (Task 4, tested with a fake getter that is set late).

## File map
| File | Responsibility |
|---|---|
| `mobile/utils/queuedMutations.ts` (new) | `QUEUED_KEYS`, `scopeFor()`, `coalesceQueued()`, `isQueuedKey()` — pure helpers over a `MutationCache`. |
| `mobile/utils/offlineMutations.ts` | Registers `rsvp`, invites, **`votePoll`**, **`markGroupRead`** defaults with `networkMode:'online'`, retry, scope. |
| `mobile/utils/chatMutations.ts` | `sendMessage` default: scope, upload-inside-mutation. New `toggleReaction` default. |
| `mobile/utils/chatCache.ts` | `applyReactionToggle(messages, messageId, emoji, userId)` pure helper. |
| `mobile/utils/authToken.ts` | `waitForClerkToken(timeoutMs)`. |
| `mobile/utils/persistence.ts` (new) | `shouldDehydrateQuery`, `trimForPersist`. |
| `mobile/utils/networkError.ts` | online-aware `getErrorMessage`. |
| `mobile/utils/offlineState.ts` (new) | `isOfflineEmpty(query)`. |
| `mobile/utils/chatLoadState.ts` | adds `'offline'` state. |
| `mobile/hooks/useResumeQueuedMutations.ts` (new) | gated resume. |
| `mobile/hooks/useRefreshOrToast.ts` (new) | offline-aware refresh wrapper. |
| `mobile/hooks/useRsvp.ts`, `useVotePoll.ts`, `useMessages.ts`, `usePinnedMessages.ts` | use defaults / paused state. |
| `mobile/components/OfflineEmptyState.tsx` (new), `OfflineBanner.tsx` | UI. |
| `mobile/app/_layout.tsx` | client defaults, persister options, banner in flow, cold-start state, MutationCache.onError. |
| Screens: `(tabs)/index.tsx`, `(tabs)/groups/index.tsx`, `notifications.tsx`, `GroupDetailsScreen.tsx`, `group-chat/[id].tsx`, `MeetupCard.tsx`, `MeetupDetailModal.tsx`, `PollListModal.tsx`, `ChatMessageInput.tsx`, `ChatMessageBubble.tsx`, `group-settings/[id].tsx`, `account/delete-account.tsx` | wiring. |
| `backend/src/server.js` | `GET /api/health`. |

---

## Task 1 — Backend health route
**Files:** modify `backend/src/server.js`; test `backend/src/health.test.mjs` (new).
- [x] Test: `GET /api/health` → status 204, no body, works without auth (mount the app or the handler with supertest-style `http` like existing handler tests). Run → FAIL (404).
- [x] Add `app.get('/api/health', (_req, res) => res.sendStatus(204));` **above** `clerkMiddleware()` usage is not required (clerkMiddleware doesn't block), place it next to `app.get("/")`.
- [x] Run → PASS. `npm test` green. Commit.

## Task 2 — Mutation defaults: two modes
**Files:** modify `mobile/app/_layout.tsx`, `mobile/utils/queuedMutations.ts` (new); test `mobile/utils/__tests__/queuedMutations.test.ts`.
**Interfaces:** `export const QUEUED_KEYS = ['sendMessage','rsvp','acceptInvite','declineInvite','votePoll','toggleReaction','markGroupRead'] as const; export type QueuedKey = typeof QUEUED_KEYS[number]; export const isQueuedKey = (k: unknown): k is QueuedKey`.
- [x] Test (real `QueryClient`, `onlineManager.setOnline(false)`): a `useMutation`-equivalent `client.getMutationCache().build(client, { mutationFn })` with no key → `execute()` rejects immediately when `mutationFn` throws `ERR_NETWORK`-style error (not paused) once `defaultOptions.mutations.networkMode === 'always'`. Assert `state.isPaused === false`, `state.status === 'error'`. Run → FAIL (currently paused: promise never settles — use a 200 ms race).
- [x] Test: a mutation with `mutationKey: ['rsvp']` built after `registerOfflineMutationDefaults(client)` has `state.isPaused === true` after `execute()` offline.
- [x] Implement: `defaultOptions.mutations: { networkMode: 'always' }` in `_layout.tsx`; export `QUEUED_KEYS`/`isQueuedKey` from `queuedMutations.ts` and replace `QUEUED_MUTATION_KEYS` in `_layout.tsx`. Every `setMutationDefaults` in `offlineMutations.ts`/`chatMutations.ts` adds `networkMode: 'online'`.
- [x] Run → PASS. `tsc`. Commit.

## Task 3 — Scope + coalescing for queued keys
**Files:** modify `mobile/utils/queuedMutations.ts`, `offlineMutations.ts`, `chatMutations.ts`, `hooks/useRsvp.ts`; test `queuedMutations.test.ts`.
**Interfaces:** `scopeFor(key: QueuedKey, vars: unknown): string` → `chat:<groupId>` | `rsvp:<meetupId>` | `invite:<notificationId>` | `poll:<pollId>` | `reaction:<messageId>` | `read:<groupId>`. `coalesceQueued(cache: MutationCache, key: QueuedKey, scopeId: string): number` removes every mutation with that key whose `state.isPaused` and `scopeFor(...) === scopeId`; returns count removed.
- [x] Test `scopeFor('rsvp', { meetupId: 'm1' }) === 'rsvp:m1'` and one case per key. FAIL (module missing).
- [x] Test coalescing: queue `rsvp m1 in`, `rsvp m2 in`, `rsvp m1 out` offline; after `coalesceQueued(cache,'rsvp','rsvp:m1')` called before the third, cache holds exactly `[m2 in, m1 out]` (review focus 1). FAIL.
- [x] `scope` is a per-mutation option and `useMutation` can't vary it per call, so queued mutations are created through one helper: `queueMutation(client: QueryClient, key: QueuedKey, variables): Promise<unknown>` — runs `coalesceQueued` first for `rsvp` / `votePoll` / `markGroupRead`, then `client.getMutationCache().build(client, { mutationKey: [key], scope: { id: scopeFor(key, variables) } }).execute(variables)`. Test: after `queueMutation(client,'rsvp',{meetupId:'m1',status:'in'})` offline, the cache's only mutation has `options.scope.id === 'rsvp:m1'` and `state.isPaused === true`. FAIL.
- [x] Implement helper + `retry: 2, retryDelay: 1000` on `rsvp`, invites, `votePoll`, `markGroupRead`, `toggleReaction` defaults (sends unchanged). Switch `useRsvp` to `queueMutation`, keeping its `onSuccess` UI via `.then()` and reading `isPending/isPaused` with `useMutationState({ filters:{ mutationKey:['rsvp'] } })` for the current meetup.
- [x] Run → PASS. `tsc`. Commit.

## Task 4 — Token-gated resume
**Files:** modify `mobile/utils/authToken.ts`, `mobile/utils/authedApi.ts`, `mobile/utils/chatMutations.ts`, `mobile/app/_layout.tsx`; new `mobile/hooks/useResumeQueuedMutations.ts`; test `mobile/utils/__tests__/authToken.test.ts`.
**Interfaces:** `waitForClerkToken(options?, timeoutMs = 5000): Promise<string | null>` — resolves with the token as soon as a getter is set; `null` on timeout. `useResumeQueuedMutations({ ready: boolean })`.
- [x] Test: `waitForClerkToken()` called before `setClerkTokenGetter`, getter set 50 ms later → resolves `'tok'`. Timeout case → `null` (review focus 5). FAIL.
- [x] Implement with a resolver list drained in `setClerkTokenGetter`.
- [x] `authedApi` interceptor and `chatMutations.mutationFn` use `waitForClerkToken`.
- [x] `useResumeQueuedMutations`: `useEffect` on `[ready]` → when `ready` first becomes true: `continue()` pending-not-paused sends, then `resumePausedMutations()`; also `onlineManager.subscribe` → when online and `ready`, `resumePausedMutations()`. Remove both resume paths from `_layout.tsx` (`PersistQueryClientProvider.onSuccess` becomes a no-op prop, and the `onlineManager.subscribe` effect in `AuthLayout`). `ready = isLoaded && isSignedIn && !useIsRestoring()`; call it right after `setClerkTokenGetter`'s effect.
- [x] `MutationCache.onError`: for `isQueuedKey(key)`: toast per key (`Couldn't send your message/RSVP/vote/reaction/reply to the invite`; read-marks silent), invalidate (`messages`/`meetups`/`polls`/`notifications`), and `cache.remove(mutation)` unless key is `sendMessage`. `shouldDehydrateMutation`: `status !== 'success' && isQueuedKey(key) && (key === 'sendMessage' || status !== 'error')`.
- [x] `tsc`, run tests. Commit.

## Task 5 — Cold start offline + persister maxAge
**Files:** modify `mobile/app/_layout.tsx`.
- [x] Add `fetchStatus` to the `currentUser` query destructure. `currentUserUnavailable = !!isSignedIn && !currentUser && !noBackendUser && (isCurrentUserError || fetchStatus === 'paused')`. Replace `currentUserLoadFailed` in the routing guard, splash guard and overlay with it. Overlay text: paused → "You're offline. Connect to the internet and try again."; error → existing text. "Try again" → if `!onlineManager.isOnline()` `toast.error("Still offline")` else `refetchCurrentUser()`.
- [x] `maxAge: 30 * ONE_DAY_MS`.
- [x] `tsc`. Manual check path noted in checklist. Commit.

## Task 6 — Paused ≠ busy; offline-aware refresh
**Files:** new `mobile/hooks/useRefreshOrToast.ts`; modify `useRsvp.ts`, `MeetupCard.tsx`, `MeetupDetailModal.tsx`, `(tabs)/index.tsx`, `(tabs)/groups/index.tsx`, `notifications.tsx`, `GroupDetailsScreen.tsx`, `group-stats/[id].tsx`, `PollListModal.tsx`; test `mobile/hooks/__tests__/useRefreshOrToast.test.ts`.
**Interfaces:** `useRefreshOrToast(fns: Array<() => Promise<unknown>>): { refreshing: boolean; refresh: () => Promise<void> }`. `useRsvp()` returns `{ mutate, isBusy, isQueuedFor(meetupId): boolean }`.
- [x] Test (`react-hooks` via `@testing-library/react-native` already in jest-expo preset? if not, test the pure `refreshOrToast(isOnline, fns, toast)` function instead): offline → toast called, fns not called, resolves immediately; online → fns awaited. FAIL.
- [x] Implement; wire into the five pull-to-refresh handlers and chat `retryLoad`.
- [x] Add `info` to the module-level `toast` object in `ToastContext.tsx` (kind `'info'` already exists).
- [x] `useRsvp`: `isBusy = pending && !paused` from `useMutationState`; `isQueuedFor(id)` = a paused rsvp mutation exists for id. Replace `Alert` with `toast.info('Saved — sends when you're back online')` keyed once per meetup per offline stretch (module-level `Set` cleared on online). Not for `targetUserId`.
- [x] `MeetupCard`: prop `isRsvping` ← `isBusy && variables.meetupId === id`; new prop `rsvpQueued` renders caption "Sends when online" under the buttons. `MeetupDetailModal` same. Notifications `isAccepting/isDeclining` use `isPending && !isPaused`. `PollListModal` vote button same.
- [x] `tsc`, tests. Commit.

## Task 7 — Offline-empty state
**Files:** new `mobile/utils/offlineState.ts`, `mobile/components/OfflineEmptyState.tsx`; modify `chatLoadState.ts`, screens: `(tabs)/index.tsx`, `(tabs)/groups/index.tsx`, `notifications.tsx`, `GroupDetailsScreen.tsx`, `group-chat/[id].tsx`, `PollListModal.tsx`, `group-stats/[id].tsx`, `group-priority/[id].tsx`, `group-questions/[id].tsx`, `group-rankings/[id].tsx`, `tournament/[id].tsx`; tests `offlineState.test.ts`, `chatLoadState.test.ts`.
**Interfaces:** `isOfflineEmpty(q: { fetchStatus: string; data: unknown }): boolean`. `<OfflineEmptyState onRetry={() => void} message?: string />`. `chatLoadState({..., messagesPaused: boolean})` → `state: 'loading'|'ready'|'failed'|'offline'`.
- [x] Tests: `isOfflineEmpty({fetchStatus:'paused', data:undefined}) === true`; `{fetchStatus:'paused', data:[]} === false`; `{fetchStatus:'idle', data:undefined} === false`. `chatLoadState` with `messagesPaused:true, messagesReady:false` → `'offline'`; with `messagesPaused:true, messagesReady:true` → `'ready'` (review focus 4). FAIL.
- [x] Implement helper, component, `chatLoadState`. Each screen: `isOfflineEmpty(query) ? <OfflineEmptyState onRetry={refresh} /> : …` placed before the existing error branch. Group Details additionally: an 8 s timer (same pattern as chat) flips `isLoadingDetails || !groupDetails` into the error branch.
- [x] Chat: pass `messagesPaused: fetchStatus === 'paused'` from `useMessages` (expose `fetchStatus`), render `OfflineEmptyState` for `'offline'`.
- [x] `tsc`, tests. Commit.

## Task 8 — Banner in flow
**Files:** modify `mobile/components/OfflineBanner.tsx`, `mobile/app/_layout.tsx`, the 6 `useContentTopInset` call sites, `app/notifications.tsx` header options; delete `hooks/useContentTopInset.ts`, `contexts/OfflineBannerContext.tsx`.
- [x] `OfflineBanner` → non-absolute `View`, `paddingTop: insets.top + 4`, copy prop `variant: 'app' | 'auth'`.
- [x] `AuthLayout`: render `<OfflineBanner variant={segments[0]==='(auth)'||segments[0]==='profile-setup' ? 'auth':'app'} />` above the overlay/Stack; wrap everything below in `<SafeAreaInsetsContext.Provider value={isOnline ? insets : { ...insets, top: 0 }}>`. Notifications `Stack.Screen` options add `headerTopInsetEnabled: isOnline` (Android) — iOS native header reads the real inset; accept and device-check.
- [x] Replace `useContentTopInset()` with `useSafeAreaInsets().top` at the 6 sites; delete the two files.
- [x] `tsc`. Commit.

## Task 9 — Chat photos queue
**Files:** modify `mobile/types/chat.ts`, `utils/chatMutations.ts`, `utils/uploadImage.ts`, `components/ChatMessageInput.tsx`, `components/ChatMessageBubble.tsx`, `hooks/useMessages.ts`; test `mobile/utils/__tests__/chatMutations.test.ts`.
**Interfaces:** `PendingImage { url?: string; localUri?: string; width?: number; height?: number }`. `uploadChatImage(localUri, groupId, clientId, token): Promise<{url,width,height}>` (path `chat/<groupId>/<clientId>.jpg`, `upsert: true`). `sendMessage(..., image?: PendingImage)` unchanged signature.
- [x] Test: `buildSendRpcArgs(vars, uploaded)` (extract the arg-building from the mutationFn into a pure function) uses `uploaded.url` when `vars.image.localUri` and `vars.image.url` otherwise; omits `p_mentions` when empty. FAIL.
- [x] Implement: mutationFn → if `image?.localUri && !image.url` → `uploadChatImage` first. `ChatMessageInput`: remove upload-at-pick; `pendingImages` hold `localUri` + dimensions (from `ImagePicker` asset); `canSend` no longer gated on `uploading`; send all photos up front (`queueMutation` per photo, same scope). `toPlaceholder` sets `image_url: v.image?.url ?? v.image?.localUri`. `ChatMessageBubble` renders either (expo-image accepts file URIs).
- [x] `tsc`, tests. Commit.

## Task 10 — Reactions and read-marks as queued mutations
**Files:** modify `utils/chatCache.ts`, `utils/chatMutations.ts`, `utils/offlineMutations.ts`, `hooks/useMessages.ts`, `app/group-chat/[id].tsx`, `app/_layout.tsx`; tests `chatCache.test.ts`, `queuedMutations.test.ts`.
**Interfaces:** `applyReactionToggle(messages, messageId, emoji, userId): { messages, result: ReactionResult }` (pure). `toggleReaction` variables `{ messageId, groupId, emoji, userId, senderName }`. `markGroupRead` variables `{ groupId }`.
- [x] Tests for `applyReactionToggle`: add, change, remove; untouched messages are the same reference. FAIL.
- [x] Implement helper; `toggleReaction` default: `onMutate` applies helper to `['messages', groupId]` and returns `{ result, previous }`; mutationFn: rpc `toggle_reaction` (legacy fallback kept), then `authedApi.post('/api/groups/:id/chat-reaction', …)` when `result.action !== 'removed'` (swallow push errors); `onError` reapplies the inverse of `result` only. Global `onSuccess` upserts the returned row.
- [x] `markGroupRead` default (coalesced via `queueMutation`); chat open/close/send call `queueMutation(client,'markGroupRead',{groupId})`; global `onSuccess` invalidates `currentUser`.
- [x] `useMessages.addReaction` becomes a thin wrapper that calls `queueMutation` and resolves with `result` from `onMutate` (return it synchronously from the helper for the screen's push/toast logic). Remove the duplicate push call from `handleReact`.
- [x] `tsc`, tests. Commit.

## Task 11 — Persist less, network truth, error wording
**Files:** new `mobile/utils/persistence.ts`; modify `app/_layout.tsx`, `utils/api.ts`, `utils/networkError.ts`; tests `persistence.test.ts`, `networkError.test.ts`.
**Interfaces:** `shouldDehydrateQuery(q: { queryKey: unknown[]; state: { status: string } }): boolean`; `trimForPersist(key, data)`; `getErrorMessage(error, fallback, isOnline = onlineManager.isOnline())`.
- [x] Tests: `shouldDehydrateQuery` true for `['messages','g1']`, `['meetups']`; false for `['unreadCounts', …]`, `['linkPreview', …]`. `trimForPersist(['messages','g'], 120 msgs)` keeps the last 50 (newest `created_at`) (review focus 2). `getErrorMessage(timeoutErr, 'x', true)` → "GroupThat is taking too long to respond. Try again."; `(timeoutErr,'x',false)` → offline message; `ERR_NETWORK` → offline regardless; non-axios error offline → offline (review focus 3). FAIL.
- [x] Implement. Persister: `dehydrateOptions.shouldDehydrateQuery` + `serialize` that maps data through `trimForPersist`. Axios: `timeout: 15000` default, request interceptor sets `config.timeout = 8000` for non-GET unless already set. `NetInfo.configure({ reachabilityUrl: \`${API_BASE_URL}/api/health\`, reachabilityTest: async r => r.status === 204, reachabilityShortTimeout: 5000, reachabilityLongTimeout: 60000 })` before `onlineManager.setEventListener`.
- [x] `tsc`, tests. Commit.

## Task 12 — Destructive guards and small cleanups
**Files:** modify `hooks/useDeleteGroup.ts`, `useLeaveGroup.ts`, `useRemoveMember.ts`, `useCancelPoll.ts`, `group-settings/[id].tsx` (transfer ownership), `MeetupDetailModal.tsx` (cancel meetup), `account/delete-account.tsx`, `group-chat/[id].tsx`, `useMessages.ts`; test `queuedMutations.test.ts` (guard helper).
**Interfaces:** `requireOnline(action: string): boolean` in `utils/offlineState.ts` — toasts `You're offline. Connect to ${action}.` and returns false when offline.
- [x] Test `requireOnline` offline → false + toast called with "You're offline. Connect to delete this group."; online → true, no toast. FAIL.
- [x] Wrap each confirm (`Alert.alert(...)`) call site: `if (!requireOnline('delete this group')) return;` etc.
- [x] Chat: remove the `Alert` in `handleSend`'s catch; "Still sending…" dialog body → offline ? "This message is waiting for a connection." : "This message is still being sent."; `fetchOlder` offline → set a `olderUnavailableOffline` flag rendered once as a list header row.
- [x] `tsc`, tests. Commit.

## Task 13 — Verification
- [x] `cd mobile && npx tsc --noEmit`; `npx jest utils hooks` here; owner runs full `npm test`.
- [x] `cd backend && npm test`.
- [x] Reread spec D1–D14 against the diff; tick each.
- [x] Fresh-reviewer pass (subagent, read-only) over the whole diff against the spec.
- [ ] Device checklist (below) run on iPhone and Android by the owner.

---

## Status (2026-11-11)

All tasks built, uncommitted in the working tree (except Task 1 + the spec/plan, which went into local commit `abb9148` before the owner asked for no commits). Verification:
- Mobile `tsc --noEmit`: clean.
- Mobile unit tests: 31 suites / 266 tests pass, run through a minimal local jest config (`node` env, Babel) from a copy of the repo. **Run the real `npm test` (jest-expo) in `mobile/` on Windows.**
- Backend: 40 test files / 419 tests pass (`node --test`), including `routes/health.route.test.mjs`.
- A fresh reviewer read the spec and the diff cold; its confirmed findings were fixed (below).

### Fixed after review
- React Query resumes paused mutations by itself on reconnect (`QueryClient.mount`), before sign-in may be ready. `authedApi` now fails with `NoTokenError` instead of sending without a token, and queued defaults retry that error for ~30 s (`queuedRetry`).
- RSVP scope includes `targetUserId`, so an organizer's offline overrides for two people are both kept.
- `sendMessage` has `gcTime: Infinity`, so a failed message's Retry/Discard bubble isn't garbage-collected after 5 minutes.
- "Interrupted by app kill" handling runs only on the first resume after restore; on later reconnects a running reaction is left alone.
- A failed queued reaction reloads its chat (`queuedErrorRefreshKey`).
- NetInfo reachability uses GET (HEAD has no body for the older-backend fallback).
- Group Details' 8 s timeout only counts while actually fetching.
- Full-screen modals drawn over the banner (group-settings modals, chat image viewer, emoji picker) use the real top inset (`useWindowInsets`).

### Deviations from the spec
- **D13:** axios timeout is 15 s for every request, not 15 s GET / 8 s other. An explicit per-call timeout (transfer ownership passes 15 s) can't be told apart from the default in an interceptor, and one value is simpler.
- **D10:** reactions retry only `NoTokenError`, not 2 retries: `toggle_reaction` is a toggle, so re-sending one whose reply was lost would undo it. A reaction interrupted by an app kill is dropped and its chat reloaded.
- **D8:** this version of the native stack has no `headerTopInsetEnabled`; Notifications' Android header under the banner is a device-check item.
- Coalesced (replaced) queued actions never resolve their promise; only the latest intent's callbacks run. Intended.
- A photo queued offline is kept as its picker file path. If the OS purges that cache, or an iOS app update changes the app container path before it's sent, the send fails (red bubble, Discard).

### Device checklist (airplane mode unless noted)
1. Fresh install (or clear app data) → airplane mode → open: "You're offline" screen, not a stuck splash.
2. Online once, then offline: Home, Groups, Notifications, a chat opened before, a chat never opened, Group Details never opened → saved data or "You're offline", nothing spins.
3. Pull to refresh on each tab offline → toast, spinner doesn't start.
4. RSVP In → Out → In on one card offline; card shows "sends when you're back online"; reconnect → server shows In, one toast total.
5. RSVP offline → kill app → reconnect → open: RSVP lands (check from another device).
6. Delete group / leave / remove member / transfer / cancel meetup / cancel poll / delete account offline → toast, no confirm dialog, nothing happens on reconnect.
7. Create group offline → error message, Back works.
8. Three texts + two photos offline → kill → reconnect: all arrive, in order, photos upload.
9. React, then change reaction, offline → reconnect → final reaction correct; author gets one push.
10. Vote in a poll offline → "Your vote sends when you're back online" → reconnect → counted.
11. Accept an invite offline → button says "Accepts when online" → reconnect → joined.
12. Read a chat offline → reconnect → unread badge clears.
13. Banner: offline on every screen type (tabs, chat, group settings + its modals, Notifications on **Android** especially, chat photo viewer, emoji picker) → nothing under the banner or the notch, no double gap.
14. Cold start online after killing the app mid-send → message sends once.
15. Hotel/captive-portal Wi-Fi → app shows offline; normal Wi-Fi where Google is blocked but GroupThat isn't → app works.

### Ship order
Backend (`/api/health`) first. The app also accepts an older backend (Express's "Cannot GET /api/health" 404 counts as reachable), so the order isn't fatal, but deploy the backend first anyway.
