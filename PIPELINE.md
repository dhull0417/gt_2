# GroupThat Dev/Staging/Production Pipeline

## Current environment matrix

Mongo and Clerk are **shared** across local dev, staging, and production right
now (by deliberate choice, to keep things simple) — the only real separation
is at the Vercel deployment level.

| | Local dev | Staging (`staging` branch) | Production (`main` branch) |
|---|---|---|---|
| Mongo | production cluster (`Cluster0`, db `gt_2`) | same | same |
| Clerk | production app (`relaxing-flounder-31`) | same | same |
| Supabase | production project | same | same |
| Backend | your machine, `npm run dev` | Vercel Preview Deployment | Vercel Production Deployment |
| Backend URL | `http://<lan-ip>:5001` | `gt-2-git-staging-dallins-projects-b0f73770.vercel.app` (stable) | `gt-2-peach.vercel.app` |
| Mobile build profile | `development` / `simulator` | `preview` / `emulator` | `production` |
| OTA channel | `development` | `preview` | `production` |

A separate dev Mongo cluster (`groupthat-dev`) and dev Clerk app
(`upward-mayfly-16`) were created during initial pipeline setup and still
exist, but are **not currently used** — kept around in case a real dev/prod
data split is revisited later. Supabase's Third-Party Auth still trusts both
Clerk domains; only the production one is actively used.

## Environment variables

- `backend/.env.example` and `mobile/.env.example` document every variable
  name each app expects. Copy to `backend/.env` / `mobile/.env.local`
  (both gitignored) and fill in real values.
- Vercel: Production and Preview scopes currently hold identical values for
  `MONGO_URI` and the Clerk keys (see table above). Managed manually in the
  Vercel dashboard/CLI.
- EAS Environment Variables: one set per `development` / `preview` /
  `production` environment, referenced by each profile's `"environment"`
  field in `mobile/eas.json`. Pull locally with
  `eas env:pull --environment development`.
- **Environment variables are managed manually, not by an assistant/script.**
  This applies to Vercel, EAS, and every `.env*` file.

## Branching workflow

- `main` — production. Protected: no direct pushes, only via a merged pull
  request, and that PR's source branch must be `staging` (enforced by
  `.github/workflows/verify-pr-source.yml` plus a required status check in
  branch protection). Repo admins can still bypass this in a genuine
  emergency — that bypass is deliberately left enabled, not a gap to close.
- `staging` — long-lived integration branch. Every push here redeploys the
  stable Vercel Preview URL. This is the default place to test a change
  before it goes anywhere near `main`.
- `feature/*` — short-lived, branch off `staging`, merge back into `staging`
  when ready.

## Making a schema change

Migrations live in `backend/src/migrations/`, managed with `migrate-mongo`:

- `npm run migrate:status` — see what's pending
- `npm run migrate:create <name>` — scaffold a new migration
- `npm run migrate:up` / `npm run migrate:down` — apply / roll back

Because dev, staging, and production all point at the same database right
now, there's no isolated copy to test a migration against first — run these
carefully, and prefer the review discipline below over relying on a safety
net that doesn't currently exist:

- New fields must be optional/defaulted, or backfilled via a migration
  before any code that depends on them ships.
- Never remove or rename a field in the same deploy that stops reading the
  old one — do it in two phases: add + backfill first, remove only in a
  later deploy once nothing reads the old field.
- `connectDB()` (`backend/src/config/db.js`) logs a warning on startup if
  there are pending migrations — don't ignore it.

## Release gate

Before submitting a `production`-profile build to the App Store or Play
Store, it must first pass through:

- **TestFlight** (iOS)
- **Play Console Internal Testing track** (Android)

These are the only environments that run Apple's/Google's actual build
processing (code signing, Hermes, R8/ProGuard) — the thing that actually
causes "works in preview, breaks in the submitted build" issues. A build
that hasn't passed through these first should not go to public review.

## Scheduled jobs (cron-job.org)

All background work is driven by cron-job.org calling the backend. Every job is
`POST https://<backend-host>/api/jobs/<name>` with the header
`Authorization: Bearer <CRON_SECRET>` (same value as `CRON_SECRET` in Vercel).
A job answers 401 on a wrong secret and 500 if `CRON_SECRET` isn't configured.
Production host is `gt-2-peach.vercel.app`. Create the same jobs against the
staging URL only if you want the staging deployment to run them.

Suggested intervals, taken from each handler's own comments (these are
recommendations, not a record of what is currently configured):

| Job | Endpoint | Suggested interval | Why |
|---|---|---|---|
| Open RSVPs / priority-group announcements | `notify-rsvp-open` | every 1 min | RSVP open times should land on time |
| Minimum-headcount auto-cancel (Premium) | `cancel-under-minimum` | every 1 min | runs right after an RSVP deadline |
| "Starting soon" push | `notify-meetup-reminder` | every 1-5 min | fires 30 min before start |
| Staged "you haven't RSVP'd" reminders | `notify-rsvp-reminder-stages` | every 5-15 min | stages are hours apart |
| Generate upcoming meetups | `regenerate-meetups` | every 5-15 min | idle runs are cheap; only due groups load |
| Expire polls | `expire-polls` | every 5 min | notifies the winning option |
| Lifecycle emails (Resend) | `send-lifecycle-emails` | every 5 min | sends at most 60 per run, inside each user's 9am-7pm window; add `?dryRun=1` to preview without sending |
| Expire past meetups | `expire-meetups` | every 5-10 min | meetups expire 1 hr after start |
| Clean up old meetups | `cleanup-meetups` | once a day | deletes meetups expired > 10 days |

`send-lifecycle-emails` does nothing until `LIFECYCLE_EMAILS_ENABLED=true`.
Because Mongo is shared across environments, do not point two environments'
cron jobs at the same work: each job should have exactly one caller.

## Known gaps (flagged, not fixed)

- Backend CI only runs unit tests (`.github/workflows/backend-tests.yml`, same
  command as `npm test` in `backend/`); mobile CI (`.github/workflows/mobile-checks.yml`)
  runs `tsc --noEmit` and jest. There is no lint step. The backend tests stub the
  database, so none of them exercise real Mongo queries.
- The `/join/:token` group-invite landing page
  (`backend/src/server.js`) is hardcoded to the production domain and
  Android bundle ID/package name — deep-link testing against staging will
  always point users at the real store listings.
