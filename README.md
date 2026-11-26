# GroupThat

GroupThat is a mobile app for getting a group of people to actually meet up: recurring or one-off meetups, one-tap RSVPs, group chat, polls, and reminders, with premium extras (waitlists, minimum headcount, priority RSVP, stats and CSV export).

## What's in this repo

| Folder | What it is |
|---|---|
| `mobile/` | The Expo / React Native app (Expo Router, TanStack Query, Clerk, RevenueCat, Supabase for chat) |
| `backend/` | The Express + Mongoose API, deployed on Vercel, with scheduled jobs for generating meetups, reminders, emails and cleanup |
| `supabase/` | SQL migrations for the chat database (run in order; the lock-down migration has a checklist at the top) |
| `web/` | The group-invite landing page |
| `PIPELINE.md` | Environments, branching, deploys, scheduled jobs and known gaps |

## Running it

```bash
# API
cd backend
cp .env.example .env      # fill in real values
npm ci
npm run dev

# App
cd mobile
cp .env.example .env.local
npm ci
npx expo start --dev-client
```

Checks that CI also runs:

```bash
cd backend && npm test
cd mobile && npx tsc --noEmit && npm test
```

Environment variables are managed by hand (Vercel, EAS and local `.env` files); see `PIPELINE.md`.
