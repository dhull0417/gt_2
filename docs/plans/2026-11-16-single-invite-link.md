# One invite link — implementation plan

**Goal:** Invites send one link that opens the app if installed, otherwise the right store, and carries the invite through the install.

**Architecture:** `invite.groupthatapp.com/join/<token>` stays the one link. The server renders a personalized landing page (Android: instant intent → Play with `referrer=gt_invite=<token>`; iOS: one-tap "Get GroupThat" that copies the link then opens the App Store). On first launch the app reads the Play install referrer (Android) or the clipboard once (iOS) and saves the invite; after sign-up the existing pending-invite flow opens a preview screen with a Join button. Invite tokens become stable per group with reset, approval, max uses, a 6-character code and a QR code.

**Tech stack:** Express + Mongoose (`node --test`, module mocks), Expo SDK 54 / React Native (jest-expo), `qrcode` (server), `expo-application` (install referrer), `expo-clipboard`.

**Spec:** project doc `claude/single-invite-link-deep-dive-2026-11-16.md` (all recommendations approved 2026-11-16; free capabilities only).

## Global constraints
- Link format: `https://invite.groupthatapp.com/join/<token>` with optional query `m=<meetupId>` (meetup invite), `r=<userId>` (who shared), `s=<source>` (`qr`). Token regex `^[A-Za-z0-9_-]{1,128}$`.
- Invite code: 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L). Codes are matched case-insensitively.
- Play referrer value: `gt_invite=<token>` plus `&gt_m=<meetupId>` when present, URL-encoded into `referrer=`.
- Tokens no longer expire by default (`expiresAt: null`). Old tokens with an `expiresAt` are made permanent the next time a member shares them.
- Dead invite reasons and messages: `revoked` / `expired` → "This invite link is no longer active."; `maxed` → "This invite link has reached its limit."; not found → "This invite link is invalid or has expired." (existing text).
- Notification types added: `join-request` (to owner + moderators, pending, Accept/Decline), `join-approved` (to requester).
- Max uses choices in the app: Unlimited, 10, 25, 50, 100.
- Rate limits (per IP, per minute, in-memory per server instance): landing page 60, QR 60, invite events 30, preview/redeem 20.
- Deferred check runs once per install (AsyncStorage flag `GT_DEFERRED_INVITE_CHECKED`), never again.
- No git commits (owner commits). Backend tests run from a local copy (`~/gtb`) synced from `backend/src`.

## Review focus
1. A removed/declined requester or a revoked link still getting in via a stale `join-request` → Task 4 test.
2. Max uses counted by people who were already members (must not count) → Task 3 test.
3. Landing page reflecting `m`/`r`/group name unescaped (XSS) → Task 7 test.
4. Clipboard content that isn't an invite being treated as one → Task 8 test.
5. A contact invite from someone who has since left the group being accepted → Task 5 test.

## Tasks
1. [x] **Invite helpers** `backend/src/utils/invites.js` (+ test): `generateInviteCode()`, `isInviteCode(s)`, `inviteStatus(invite, now)` → `active|revoked|expired|maxed`, `playReferrer({token, meetupId})`, `playStoreUrl(...)`.
2. [x] **Models:** `InviteToken` (+`code` unique sparse, `revokedAt`, `maxUses`, `uses`; `expiresAt` optional), `Group.inviteRequiresApproval`, notification types, `InviteEvent` (TTL 180 days), `PendingInvite` (TTL 30 days).
3. [x] **Invite routes** in `group.controller.js` (+ handler tests): `generateInviteLink` (stable, returns link/code/settings/stats), `POST /:groupId/invite-link/reset`, `PUT /:groupId/invite-settings`, `GET /invite/:token` preview (token or code), `POST /join/:token` (code, approval → join-request, max uses, meetup, source).
4. [x] **Join requests** in `notification.controller.js` (+ tests): accept adds the requester and notifies `join-approved`; decline; sibling requests to other managers closed.
5. [x] **Contact invites:** `POST /:groupId/contact-invite`; `claimPendingInvites(user)` on sign-up and on phone/email change → `group-invite` notification (`meta.source: 'contact'`); accept allows a contact invite whose sender is still a member.
6. [x] **Funnel + rate limit:** `utils/rateLimit.js` (+ test), `POST /api/invites/events` (public: `store_tap`, `open_app_tap`), server-side `view` (bots skipped), `join` / `join_requested` with source.
7. [x] **Landing page** `utils/invitePage.js` (+ test): personalized OG, Smart App Banner, iOS one-tap copy-then-store, Android intent with referrer, in-app browser buttons, desktop QR + code, iPad detection, dead-link page; `/qr/:token.png`; `assetlinks.json` extra fingerprints from `ANDROID_CERT_FINGERPRINTS`.
8. [x] **App helpers** `mobile/utils/inviteLink.ts` (+ jest): `parseInviteUrl`, `parseInstallReferrer`, `buildShareLink`, `normalizeInviteCode`; `mobile/utils/pendingInvite.ts` (save/take, legacy plain-token value).
9. [x] **Deferred pickup** `mobile/utils/deferredInvite.ts` + `_layout.tsx`: Android install referrer, iOS clipboard (only when it holds a URL), once per install.
10. [x] **Join screen** `app/join/[token].tsx`: preview → Join / Request to join; pending; dead link with "Ask for a new link"; opens the meetup when `m` is set. `app/join/code.tsx` code entry; auth screen invite hint + code link; Groups "+" "Join with code".
11. [x] **Sharing:** one-link `buildInviteMessage`; meetup + referrer params; Add Members contact invites call the API.
12. [x] **Invite link screen** `app/group-invite/[id].tsx`: QR, code, Share, Copy; managers: Reset link, Require approval, Max uses, 30-day stats. Entry from Group Details and Group Settings.
13. [x] **Notifications UI:** `join-request` (Accept/Decline), `join-approved`; icons and routing.
14. [x] **Verify:** backend `npm test`, mobile `tsc` + jest, render the landing page for iOS/Android/desktop/in-app/dead, fresh review against this plan.

## Status (2026-11-16)
All 14 tasks built. Backend `npm test` 501/501, mobile `tsc` clean and jest 36 suites / 309 tests (both run from local copies). Landing page rendered and checked for iOS, meetup invite, desktop (QR) and dead link. Nothing committed.

**Changes made while building (my calls):**
- Invite routes moved out of `group.controller.js` into `controllers/invite.controller.js`; `normalizePhone` moved to `utils/phone.js` (still re-exported from `user.controller.js`).
- Approval-gated joins need `supportsApproval: true` in the request body (sent by this build) instead of a version check, so the gate doesn't depend on the next version number. Older apps get "This group approves new members. Update GroupThat to ask to join."
- iOS clipboard is read automatically once, only on a fresh install (installed < 3 days ago) and only when the clipboard holds a URL. Anyone updating from an older build never sees a paste prompt.
- Signed-out people can now stay on `/join/...` (the router used to bounce them to sign-in, which could lose the token).
- The saved invite is only opened after profile setup is complete (same test as the router), so a half-finished profile no longer swallows it.
- Deleting a group or an account also deletes its saved contact invites and invite stats.

## Before release (owner)
1. `cd mobile && npx expo install expo-application` (updates yarn.lock), then a new EAS build for both stores: `expo-application` is native.
2. `cd backend && npm install` (adds `qrcode`; lock file already updated).
3. Optional: set `ANDROID_CERT_FINGERPRINTS` on Vercel to the upload key's SHA-256 (`eas credentials` → Android) so links open preview/internal builds too.
4. Resend: keep click tracking off for the lifecycle emails; tracked links break Universal/App Links.
5. Privacy policy: invited contacts' phone/email are now kept for up to 30 days (only for people a member texted an invite to).
6. Test matrix: iMessage, Android SMS, WhatsApp, Messenger, Instagram DM, Gmail (iOS + Android), desktop browser × app installed / not installed × signed in / out × link active / reset / at its limit; plus approval on and off, a meetup invite, and the invite code.

**Compatibility notes:** the backend can deploy before the new build. Older apps keep sending the two-link text (both links still work), join without a preview, and can't answer join requests. Only turn on "Approve new members" once most members have updated.
