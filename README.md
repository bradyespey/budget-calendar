# Budget Calendar
**Scope**: This README replaces prior selected overview docs

## Overview
Budget Calendar is a personal financial forecasting app for checking-balance planning. It combines Monarch-derived balances and recurring transactions, manual transactions, projection logic, and Google Calendar sync so upcoming bills, income, and projected balance changes stay in one workspace.

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
- Frontend: React 18, Vite, TypeScript, Tailwind CSS
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
- `refreshAccounts`, `updateBalance`, and `refreshTransactions` use Firebase runtime config, not browser env vars
- `refreshAccounts` calls Monarch directly, requests checking/savings refresh, and waits until those configured accounts are done syncing before returning success
- Localhost calls deployed Firebase Functions by default so dev and production use the same backend
- `VITE_FIREBASE_FUNCTIONS_BASE_URL` is optional and only needed for explicit emulator testing

Firebase runtime config still required for live Functions:

```bash
firebase experiments:enable legacyRuntimeConfigCommands
firebase functions:config:set \
  monarch.token="YOUR_MONARCH_TOKEN" \
  monarch.checking_id="YOUR_CHECKING_ACCOUNT_ID" \
  monarch.savings_id="YOUR_SAVINGS_ACCOUNT_ID"
```

Google Calendar functions also require runtime config for:
- `google.service_account_json`
- dev/prod bills calendar IDs
- dev/prod balance calendar IDs

GitHub Actions secrets required for weekly encrypted backups:
- `FIREBASE_SERVICE_ACCOUNT`
- `BACKUP_ENCRYPTION_KEY`
- `BACKUP_LOG_KEY`

## Run Modes
- Dev app: `npm run dev`
- Local functions emulator: `cd functions && npm run serve`
- Type check: `npm run type-check`
- Production build: `npm run build`

Development environment loading:
- `npm run dev` runs plain `vite` — Vite loads `.env` automatically from the project root

Local function testing:
- Create `functions/.runtimeconfig.json` from Firebase runtime config before starting the emulator
- Keep `functions/.runtimeconfig.json` local only; it contains secrets and is gitignored
- Set `VITE_FIREBASE_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/budgetcalendar-e6538/us-central1` only when intentionally testing the local emulator

## Scripts and Ops
- Dev: `npm run dev`
- Build: `npm run build`
- Type check: `npm run type-check`
- Automation check: `npm run check:automation`
- Trigger nightly workflow: `npm run trigger:nightly`
- Watch Netlify deploy after push: `npm run deploy:watch`

Key Functions:
- `refreshAccounts`: calls Monarch directly to refresh configured checking/savings accounts and waits for those syncs to complete
- `updateBalance`: pulls checking, savings, and credit-card totals from Monarch and stores account snapshots
- `refreshTransactions`: refreshes recurring Monarch streams into Firestore; maps Monarch account types to Checking/Credit Card; Unknown account type + negative amount is reclassified as Credit Card (CC charges without a real account don't affect balance projection)
- `budgetProjection`: calculates projected checking balances with business-day adjustments; excludes Credit Card and unknown-account-type expenses from balance (those are covered by CC payment bills); writes monthly cash flow summary (category averages and bills/income by frequency) to `monthlyCashFlow/current`
- `syncCalendar`: syncs bills and projected balances to Google Calendar as all-day events with event reminders disabled
- `clearCalendars`: clears future events from configured calendars
- `runAll`: orchestrates the nightly automation flow; it requests a Monarch account refresh first, but if Monarch is still syncing after the wait window, it records a warning and continues with the balance, transaction, projection, and calendar steps using available account data

Automation:
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
- `/dashboard`: balances, alerts, forecast summary, savings trend; category averages (client-side, all bills, clickable → filtered transactions); bills/income summary by frequency (daily/weekly/biweekly/semimonthly/monthly/yearly/one-time)
- `/transactions`: Recurring Bills & Income — Monarch entries are read-only (categories and details sync from Monarch); manual transactions can be created and edited freely
- `/upcoming`: 7-day projection view, transaction search, balance-impact vs excluded display; CC charges shown as excluded (covered by CC payment bill)
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
