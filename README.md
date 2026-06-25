# Budget Calendar
**Scope**: This README replaces prior selected overview docs

## Overview
Budget Calendar is a personal financial forecasting app for checking-balance planning. It combines Monarch-derived balances and recurring transactions, manual transactions, projection logic, and Google Calendar sync so future bills, income, and projected balance changes stay in one workspace.

## Live and Admin
- App URL: `https://budget.theespeys.com`
- Frontend hosting: Netlify
- Backend: Firebase Auth, Firestore, and Cloud Functions
- Monitoring:
  - Netlify build watch: `npm run deploy:watch`
  - Firebase logs: `firebase functions:log --only <functionName>`
  - GitHub Actions: `.github/workflows/`
  - Weekly backup status logging: `.github/workflows/backup.yml`

## Tech Stack
- Frontend: React 19, Vite 8, TypeScript 6, Tailwind CSS 4
- Backend: Firebase Functions v1, Firestore, Firebase Auth
- Forecasting data: Monarch Money unofficial API
- Calendar sync: Google Calendar API via Firebase Functions
- Automation: GitHub Actions + Netlify deploy pipeline

## Quick Start
```bash
git clone https://github.com/bradyespey/budget-calendar.git
cd BudgetCalendar
npm install
npm run dev
```

## Environment
Copy `.env.example` to `.env` and fill in values. See `.env.example` for all required variables.

Variable reference:

```env
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
VITE_ALLOWED_EMAILS=YOUR_ALLOWED_EMAILS
VITE_SITE_URL=YOUR_SITE_URL
VITE_DEBUG_MODE=true
VITE_FIREBASE_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/budgetcalendar-e6538/us-central1
```

Important notes:
- Do not expose paid provider keys through `VITE_*`
- `refreshAccounts`, `updateBalance`, and `refreshTransactions` use server-side Firebase Functions env vars, not browser env vars
- `refreshAccounts` calls Monarch directly, requests checking/savings refresh, and waits until those configured accounts are done syncing before returning success
- Localhost calls deployed Firebase Functions by default so dev and production use the same backend
- `VITE_FIREBASE_FUNCTIONS_BASE_URL` is optional and only needed for explicit emulator testing from the browser UI

Firebase Functions env vars required for live Functions:

```bash
MONARCH_TOKEN=
MONARCH_CHECKING_ID=
MONARCH_SAVINGS_ID=
```

Google Calendar functions also require:
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- dev/prod bills calendar IDs
- dev/prod balance calendar IDs

Low balance email alerts also require:
- `RESEND_API_KEY`
- `LOW_BALANCE_ALERT_EMAIL` — notification recipient, currently `bradyjennytx@gmail.com`
- `RESEND_FROM_EMAIL` — recommended sender: `Budget Calendar <comments@theespeys.com>`
- `BUDGET_CALENDAR_SITE_URL`

Keep local values in `functions/.env`. Firebase deploy reads that local file for the Functions environment. The shared Resend key is stored in 1Password under `Private` → `Resend` → `Email Sending API key`.

GitHub Actions secrets required for weekly encrypted backups:
- `FIREBASE_SERVICE_ACCOUNT`
- `BACKUP_ENCRYPTION_KEY`
- `BACKUP_LOG_KEY`

## Run Modes
- Dev app: `npm run dev`
- Dev app against local Functions emulator: run `npm run dev:functions`, then `npm run dev:local-functions`
- Local functions emulator: `cd functions && npm run serve`
- Type check: `npm run type-check`
- Production build: `npm run build`

Development environment loading:
- `npm run dev` runs plain `vite` — Vite loads `.env` automatically from the project root
- `npm run dev:local-functions` starts Vite with `VITE_FIREBASE_FUNCTIONS_BASE_URL=http://localhost:5001/budgetcalendar-e6538/us-central1` so function-triggering buttons call the local Functions emulator instead of deployed Functions

Local function testing:
- Fill in the local `functions/.env` values before starting the emulator
- Keep `functions/.env` local only; it contains secrets and is gitignored
- Set `VITE_FIREBASE_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/budgetcalendar-e6538/us-central1` only when intentionally testing the local emulator
- The Functions emulator is functions-only by default; Firestore/Auth calls still use the configured Firebase project, so local function tests can update live app data

## Scripts and Ops
- Dev: `npm run dev`
- Dev with local Functions: `npm run dev:functions` plus `npm run dev:local-functions`
- Build: `npm run build`
- Type check: `npm run type-check`
- Automation check: `npm run check:automation`
- Trigger nightly workflow: `npm run trigger:nightly`
- Watch Netlify deploy after push: `npm run deploy:watch`

Key Functions:
- `refreshAccounts`: calls Monarch directly to refresh configured checking/savings accounts and waits for those syncs to complete
- `updateBalance`: pulls checking, savings, and credit-card totals from Monarch and stores account snapshots
- `refreshTransactions`: refreshes recurring Monarch streams into Firestore; maps Monarch account types to Checking/Credit Card; Unknown account type + negative amount is reclassified as Credit Card (CC charges without a real account don't affect balance projection); known credit card payments store a checking-impact date when the card due date differs from the bank draft date
- `budgetProjection`: calculates projected checking balances with business-day adjustments; excludes Credit Card and unknown-account-type expenses from balance (those are covered by CC payment bills); uses credit card draft rules for known cards (Chase Southwest/Amazon Prime on the 23rd with next-business-day movement, Apple Card on the 1st of the following month with Sunday/holiday movement, AmEx on the 14th with next-business-day movement); writes monthly cash flow summary (category averages and bills/income by frequency) to `monthlyCashFlow/current`; sends one Resend email when the forecast changes below the configured threshold, including the first threshold-crossing date and the lowest point in the current forecast
- Projection day `0` stores the current live checking balance and displays today's transactions without subtracting them again, since they may already be reflected in the account balance. Future days apply scheduled transactions normally. If a bill posts on a different date than its configured schedule, update the transaction date for a more accurate forecast.
- Some credit-card payments draft from checking later than the due date shown on the Transactions page. For those rows, use the info tooltip beside the transaction name to confirm the checking-impact date used by the projection.
- `syncCalendar`: syncs bills and projected balances to Google Calendar as all-day events with event reminders disabled
- `clearCalendars`: clears future events from configured calendars
- Icon maintenance keeps manual/custom icon URLs and backup/restore support; AI-based icon generation has been removed
- `runAll`: orchestrates the nightly automation flow; it requests a Monarch account refresh first, but if Monarch is still syncing after the wait window, it records a warning and continues with the balance, transaction, projection, and calendar steps using available account data

Automation:
- `.github/workflows/budget-nightly.yml`: runs the complete `runAll` refresh daily at `8:15 AM America/Chicago`, including daylight-saving adjustments. The off-hour minute reduces the chance of GitHub Actions queue delays that commonly affect schedules at the start of an hour.
- `.github/workflows/backup.yml`: runs the encrypted Firestore backup weekly or manually, commits changed backup data, and posts the run status to AdminPanel

## Deploy
- Frontend deploys from GitHub to Netlify
- Functions deploy separately through Firebase

```bash
npx firebase deploy --only functions
```

Build monitoring:
```bash
npm run deploy:watch
```

Important:
- `deploy:watch` must be read to completion
- treat any `Build failed` output or error lines as a failed deploy even if the watcher prints a success-style summary

## App Pages / Routes
- `/dashboard`: balances, alerts, forecast summary, balance projection chart, savings trend; monthly flow totals positive/negative recurring Monarch and manual transactions, excludes one-time rows and credit-card payment rows, normalizes non-monthly frequencies; category averages (client-side, all bills, clickable → filtered transactions); bills/income summary by frequency (daily/weekly/biweekly/semimonthly/monthly/quarterly/yearly/one-time)
- `/transactions`: Recurring Bills & Income — Monarch entries are read-only (categories and details sync from Monarch); manual transactions can be created and edited freely
- `/calendar`: projection calendar, compact search, month/week/day views, refresh action, balance-impact vs excluded display; CC charges shown as excluded (covered by CC payment bill)
- `/settings`: projection settings, quick actions, maintenance actions, calendar controls
- `/login`: restricted sign-in and demo access

## Directory Map
```text
BudgetCalendar/
├── src/
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── api/
│   ├── utils/
│   └── types/
├── functions/
│   └── src/functions/
├── scripts/
├── .github/workflows/
├── docs/
├── netlify.toml
└── package.json
```

## Troubleshooting
- Monarch `401` on balance/transaction refresh:
  - update Firebase runtime config `monarch.token`
  - verify checking/savings account IDs
- Calendar actions report auth failures:
  - verify `google.service_account_json`
  - verify calendar IDs and calendar sharing with the service account
- Projection looks off around dates:
  - re-run `budgetProjection`
  - confirm recurring transaction dates and checking-impact rules
- Netlify deploy watcher finishes but site is broken:
  - read full watcher output and look for `Build failed`

## AI Handoff
Read this README first, then scan `src/`, `functions/src/functions/`, and `scripts/`. Keep paid keys out of browser env vars, preserve the current Firebase runtime config pattern for Monarch and Google Calendar, and prefer minimal changes over new abstractions.

## Links
- [Projection workflow notes](docs/Apple%20Notes%20Export/Budget%20Projection%20Workflow.md)
- [Monarch integration notes](docs/Apple%20Notes%20Export/Monarch%20Money%20API%20Integration%20Guide.md)
- [Calendar projection notes](docs/calendar-projection-notes.md)
