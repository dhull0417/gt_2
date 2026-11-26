# Production cutover for 1.4.x (Resend, RevenueCat and everything else on `staging`): design

_2026-11-25. Size: an operations project (one small code change, the rest is configuration and deploys)._

## Intent
Make the production backend and the store builds run what `staging` runs today, with lifecycle emails (Resend) and subscriptions (RevenueCat) working for real users. Chosen scope: the **full cutover** (option A). Merging `staging` → `main` ships all 74 commits, so every production step those commits need is part of this work, not only Resend and RevenueCat.

## Goals
- Production backend on `staging`'s code, with the RevenueCat webhook, Resend webhook, lifecycle-email job, `cancel-under-minimum`, `/go` links, chat webhook and the rest live.
- RevenueCat and Resend events and cron jobs reach production, each exactly once.
- New store builds (iOS and Android) live, with subscriptions approved in both stores.
- Lifecycle emails switched on in production only after the new store build is live.

## Non-goals
- Phase 4 switches other than `PUSH_CHANNELS_ENABLED` and `LIFECYCLE_EMAILS_ENABLED` (`MUTE_ALL_PUSHES_ENABLED`, `CHAT_SYSTEM_MESSAGES_ENABLED`, `PREMIUM_WAITLIST_ENFORCED`) and the chat lockdown. They wait for old-app usage to drop (cutover runbook).
- Phase 5 legacy-code cleanup.

## Anti-goals
- **No change to any dashboard, variable, setting, branch or database without the owner's explicit approval of that specific step.** Claude reads freely, then asks naming the exact setting and value.
- Claude never types a secret (API keys, webhook secrets) into a field. The owner enters those.
- No duplicated cron jobs or webhooks: staging and production share one MongoDB (`MONGO_URI` is "Production and Preview") and one Supabase project, so a copy would process everything twice.

## Facts this rests on (checked 2026-11-25)
- `staging` = `origin/staging` = `dac6cec`, clean tree. `main` (`f36ac3c`) is 74 commits behind and has 2 commits `staging` lacks. Both are already in `staging` in newer form (`utils/invitePage.js`). The merge conflicts in `backend/src/server.js` only (keep `staging`'s side). `web/join.html` merges cleanly and takes `main`'s real App Store id.
- `TOURS_ALWAYS_SHOW` still lists `group-details` (testing mode). It must be emptied before the store build.
- **Vercel:** Resend, `EMAIL_*`, `REVENUECAT_*` (entitlement `groupthat_premium`, confirmed by the owner) and Supabase keys all apply to Production. Production has its own `PUBLIC_BASE_URL` and `RESEND_WEBHOOK_SECRET`. `LIFECYCLE_EMAILS_ENABLED` is Preview-only. There is no `CHAT_WEBHOOK_SECRET` or `CHAT_PUSH_MODE` yet. `EMAIL_PRICE_TEXT` is unset (default prices are used).
- **Expo:** the production environment has the production API URL and both RevenueCat public keys.
- **RevenueCat:** the App Store key is valid and Apple notifications are arriving. Play credentials are valid and Google notifications are connected. The `default` offering is current, with a paywall and monthly + yearly packages for both stores. App Store products show "Could not check" (no App Store Connect API key). There is **one webhook, pointing at staging**, sending Production + Sandbox events.
- **Resend:** domain verified. Two webhooks: staging and production (`gt-2-peach.vercel.app/api/email/webhook/resend`).
- **cron-job.org:** "Cancel Under Minimum" and "Notify Meetup Reminder" call **staging**. "RESEND EMAILS" (production) is inactive after failing, because the route isn't on `main` yet. Five other jobs call production and succeed.
- `invite.groupthatapp.com` serves the production backend (its AASA returns 200). `/api/health` and `/go/meetups` return 404 on production today (expected before the merge).

## Approach
Follow the cutover runbook's order, with the Resend and RevenueCat steps placed where their routes first exist:
1. Fix the release blocker and merge `main` into `staging` (so the PR is conflict-free).
2. Prepare the Production variables **before** the merge, so the first production deploy has them.
3. Merge `staging` → `main`; Vercel deploys production. Verify.
4. Database scripts, then **repoint** (not copy) the RevenueCat webhook and staging cron jobs to production, then turn the lifecycle-email job back on (it sends nothing until the switch is on).
5. Chat push webhook switch-over.
6. Store builds and review (subscriptions submitted with the iOS version).
7. Once the store builds are live: `LIFECYCLE_EMAILS_ENABLED=true` and `PUSH_CHANNELS_ENABLED=true` on Production, and lifecycle emails off on Preview.

Alternative considered: Resend and RevenueCat only (option B). Rejected by the owner, because the merge deploys everything anyway.

## Decisions (Claude's calls, open to correction)
- **One RevenueCat webhook, moved to production.** Because the database is shared, staging still sees Premium changes. Staging can also call `premium/sync` directly.
- **Both Resend webhooks stay.** The handler (`resendWebhook` in `email.controller.js`) only `$set`s bounce and complaint flags on users, so receiving an event twice is harmless.
- The cron jobs that call staging are edited in place to the production URL, not duplicated.
- The deliverability items (SPF, Google DKIM, Apple private relay) are included as an independent optional task.
