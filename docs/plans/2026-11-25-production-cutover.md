# Production cutover for 1.4.x: plan

**Goal:** production backend and store builds run `staging`'s code, with Resend lifecycle emails and RevenueCat subscriptions live for real users.
**Architecture:** One Vercel project (`gt-2`): `main` deploys Production (`gt-2-peach.vercel.app`, `invite.groupthatapp.com`), and `staging` deploys Preview. Staging and production share one MongoDB and one Supabase project. Cron jobs live in cron-job.org, and webhooks come from RevenueCat and Resend.
**Tools:** git, Vercel, cron-job.org, RevenueCat, Resend, Supabase SQL editor, EAS, App Store Connect, Play Console.
**Spec:** `docs/specs/2026-11-25-production-cutover-design.md`. Background: `claude/cutover-runbook-2026-10-27.md` (project doc).

## Global constraints
- **Approval gate:** every step marked 🔒 changes something (a dashboard, a variable, a branch, the database, a store). Claude stops before it, names the exact setting and value, and waits for the owner's "yes" to that step. Steps marked 👀 are read-only.
- Claude never types secrets. The owner enters secret values; Claude may prepare everything around them.
- Never duplicate a cron job or webhook (shared database). Repoint them.
- `LIFECYCLE_EMAILS_ENABLED` stays unset on Production until Task 11.
- Leave these unset on Production: `MUTE_ALL_PUSHES_ENABLED`, `CHAT_SYSTEM_MESSAGES_ENABLED`, `PREMIUM_WAITLIST_ENFORCED`.
- Production URL: `https://gt-2-peach.vercel.app`. Public link domain: `https://invite.groupthatapp.com`.

## Review focus (failure modes no unit test covers)
1. **Double processing** after repointing (two cron jobs or two RevenueCat webhooks hitting the same database). Checked in Tasks 6 and 7: each job and webhook is listed exactly once afterwards.
2. **Production deploy missing a variable** because it was added after the deploy. Checked in Task 4: the deployment's build time is later than the last variable change, else redeploy.
3. **Double chat pushes** in the gap between the SQL insert and `CHAT_PUSH_MODE=webhook`. Checked in Task 8: one push per message from both an old and a new app.
4. **Store build carrying the testing-mode tour.** Checked in Task 1 by a unit test.
5. **Emails linking to a paywall that isn't in the store yet.** Checked in Task 11: the switch waits until both store versions are live.

---

### Task 1: Release blocker, empty `TOURS_ALWAYS_SHOW` 🔒 (repo)
**Files:** modify `mobile/utils/screenTours.ts`; test `mobile/utils/__tests__/screenTours.test.ts`.
- [x] Add the test `no tour is in always-show (testing) mode`: `expect(TOURS_ALWAYS_SHOW).toEqual([])`.
- [x] Run `npx jest utils/__tests__/screenTours.test.ts` in `mobile/`. Expect it to FAIL (received `["group-details"]`).
- [x] Set `export const TOURS_ALWAYS_SHOW: readonly string[] = [];`
- [x] Run the test again and expect PASS. Then run the full mobile `npm test` (owner's machine) and `npx tsc --noEmit`.
- [x] 🔒 Commit to `staging`: "Turn off always-show mode for the Group Details tour".
- Done 2026-11-25 as `5710723`. Also updated two stale `EditScheduleScreen` lock tests left by `dac6cec` (Priority RSVP preview). Full mobile suite 856/856 on the owner's machine.

### Task 2: Merge `main` into `staging` 🔒 (repo)
- [ ] 👀 Confirm the tree is clean and `staging` = `origin/staging`.
- [ ] 🔒 `git merge origin/main`. Resolve `backend/src/server.js` by keeping **`staging`'s side** (`git checkout --ours backend/src/server.js`), because `main`'s invite-page changes already live in `utils/invitePage.js`. `web/join.html` auto-merges and takes `main`'s App Store id `id6756112941`.
- [ ] Run backend `npm test` and expect all pass. Run `git diff origin/main -- web/join.html` and expect no output.
- [ ] 🔒 Commit the merge and push `staging`. 👀 The Preview deploy succeeds. On the staging URL, `/api/health` → 200 and `/join/<any>` renders.
- Note: git in the connected folder needs delete permission, or it leaves `.lock` files. Ask once before this task.

### Task 3: Production variables in Vercel (before the merge) 🔒 (Vercel)
- [ ] 👀 Owner reveals Production `PUBLIC_BASE_URL` and confirms it is exactly `https://invite.groupthatapp.com`. 🔒 Fix it if not.
- [ ] 🔒 Owner generates a random secret and adds `CHAT_WEBHOOK_SECRET` (Production + Preview, Sensitive). Claude doesn't see or type it.
- [ ] 👀 Prices: App Store and Play monthly/annual prices vs the email default ($4.99 / $39.99). 🔒 If they differ, add `EMAIL_PRICE_TEXT` (Production + Preview) with the real prices.
- [ ] 👀 Confirm these are absent on Production: `LIFECYCLE_EMAILS_ENABLED`, `CHAT_PUSH_MODE`, `MUTE_ALL_PUSHES_ENABLED`, `CHAT_SYSTEM_MESSAGES_ENABLED`, `PREMIUM_WAITLIST_ENFORCED`, `PUSH_CHANNELS_ENABLED`.

### Task 4: Merge `staging` → `main` and deploy production 🔒 (GitHub + Vercel)
- [ ] 🔒 Open PR `staging` → `main` (no conflicts expected after Task 2). Owner merges.
- [ ] 👀 The Vercel Production deployment for the merge commit is Ready, and was built after the Task 3 variable changes. 🔒 Redeploy if not.
- [ ] 👀 Check these URLs:
  - `https://gt-2-peach.vercel.app/api/health` → 200
  - `https://invite.groupthatapp.com/api/health` → 200
  - `https://invite.groupthatapp.com/go/meetups` → 200 (the `/go` page)
  - the AASA at `https://invite.groupthatapp.com/.well-known/apple-app-site-association` lists `/go/*`
  - `assetlinks.json` → 200
- [ ] 👀 The live 1.3.x app still works against production: sign in, open a group, RSVP (legacy path).
- Rollback: Vercel → Deployments → promote the previous production deployment.

### Task 5: Database steps 🔒 (database, run from `backend/` with production `MONGO_URI`)
- [ ] 👀 `npm run migrate:status`. Expect both migrations "applied" (shared database, already run from staging). 🔒 `npm run migrate:up` only if one shows pending.
- [ ] 🔒 `node src/scripts/syncChatMembership.js` (makes `group_members` match Mongo).
- [ ] 👀 `node src/scripts/deleteSampleGroups.js` (dry run) and review the list. 🔒 Then the same with `--apply` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set locally).

### Task 6: RevenueCat webhook to production 🔒 (RevenueCat)
- [ ] 🔒 Edit the existing webhook (`WEBHOOK_AUTH`): change its URL from the staging URL to `https://gt-2-peach.vercel.app/api/revenuecat/webhook`. Keep the Authorization header (same `REVENUECAT_WEBHOOK_AUTH` on all environments), "Both Production and Sandbox", all apps and all events.
- [ ] 🔒 Send a test event. 👀 Vercel Production logs show `POST /api/revenuecat/webhook` 200.
- [ ] 👀 Exactly one webhook is listed.
- Optional 🔒: add an App Store Connect API key in RevenueCat → App Store app, so the iOS products show their status and prices.

### Task 7: cron-job.org 🔒
- [ ] 🔒 Edit "GroupThat - Cancel Under Minimum": URL → `https://gt-2-peach.vercel.app/api/jobs/cancel-under-minimum` (same schedule and headers).
- [ ] 🔒 Edit "GroupThat - Notify Meetup Reminder": URL → `https://gt-2-peach.vercel.app/api/jobs/notify-meetup-reminder`.
- [ ] 🔒 Turn "RESEND EMAILS" back on (`/api/jobs/send-lifecycle-emails`, every 5 min). It returns 200 and sends nothing while `LIFECYCLE_EMAILS_ENABLED` is unset.
- [ ] 👀 After one cycle, all 8 jobs show "Successful (200)" and none call the staging URL.

### Task 8: Chat push webhook (runbook Phase 2, step 4) 🔒 (Supabase + Vercel)
- [ ] 🔒 Owner runs in the Supabase SQL editor, with the Task 3 secret:
  `insert into private.app_settings (key, value) values ('chat_webhook_url','https://gt-2-peach.vercel.app/api/chat/webhook/message'), ('chat_webhook_secret','<CHAT_WEBHOOK_SECRET>') on conflict (key) do update set value = excluded.value;`
- [ ] 🔒 Right away: add `CHAT_PUSH_MODE=webhook` on Production + Preview, and redeploy both.
- [ ] 👀 One message from a 1.3.x app and one from a new build. Each member gets exactly one push. `select status_code, created from net._http_response order by created desc limit 10;` shows 200s.
- Rollback: `delete from private.app_settings where key in ('chat_webhook_url','chat_webhook_secret');` then remove `CHAT_PUSH_MODE` and redeploy.

### Task 9: Subscriptions ready in both stores 👀 / 🔒
- [ ] 👀 App Store Connect → Subscriptions: `groupthat_premium_monthly` and `groupthat_premium_yearly` exist in one group, with prices, localizations and a review screenshot, and are "Ready to Submit" (or approved).
- [ ] 👀 Play Console: subscription `premium`, base plans `monthly` + `annual` active (RevenueCat shows them Published).

### Task 10: Store builds 🔒 (EAS + stores)
- [ ] 🔒 `eas build --profile production --platform all` from `main` (version 1.4.4, native build, not OTA).
- [ ] 👀 TestFlight: install, sign in, open the paywall (both packages with prices), make a sandbox purchase, and Profile shows "Premium Active". RevenueCat → customer shows `groupthat_premium`. The production webhook got the event.
- [ ] 👀 App Store Connect no longer shows the ITMS-90725 warning for this build.
- [ ] 🔒 Submit iOS for review **with both subscriptions attached to the version**. 🔒 Promote Android to the production track.

### Task 11: After both store versions are live 🔒 (Vercel)
- [ ] 🔒 Production: `LIFECYCLE_EMAILS_ENABLED=true` and `PUSH_CHANNELS_ENABLED=true`. Redeploy.
- [ ] 🔒 Preview: set `LIFECYCLE_EMAILS_ENABLED=false` (staging shouldn't email real users from the shared database).
- [ ] 👀 Create a new production account. The welcome email arrives from `EMAIL_FROM`. Its button opens the app on iPhone and Android (`/go` on `invite.groupthatapp.com`). Resend → Logs shows "delivered", and the production webhook returns 200.
- [ ] 👀 Unsubscribe link works.

### Task 12 (optional, independent): Deliverability 🔒 (DNS, Google Admin, Apple Developer)
- [ ] 🔒 SPF TXT on `groupthatapp.com` root: `v=spf1 include:_spf.google.com ~all`.
- [ ] 🔒 Google Workspace DKIM (`google._domainkey`).
- [ ] 🔒 Apple "Sign in with Apple for Email Communication": domain `groupthatapp.com`, sender = `EMAIL_FROM`.
- [ ] 👀 Look up the records once they're live.

### Task 13: Close out 👀
- [ ] Reread the spec and tick each goal against the evidence above.
- [ ] Update `claude/todo.md` (Lifecycle emails → Production cutover items) and the cutover runbook with what was done and when.
- [ ] Start the weekly `node src/scripts/appVersionReport.js 14` check for the Phase 4 switches.
