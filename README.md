# Budget Calendar
**Scope**: This README replaces prior selected overview docs

## Overview
Budget Calendar is a personal financial forecasting app for checking-balance planning. It combines Monarch-derived balances and recurring transactions, manual transactions, projection logic, and Google Calendar sync so upcoming bills, income, and projected balance changes stay in one workspace.

## Live and Admin
- App URL: `https://budget.theespeys.com`
- Frontend hosting: Netlify
- Backend: Firebase Auth, Firestore, and Cloud Functions
- External refresh endpoint: Flask API used by `refreshAccounts`
- Monitoring:
  - Netlify build watch: `npm run deploy:watch`
  - Firebase logs: `firebase functions:log --only <functionName>`
  - GitHub Actions: `.github/workflows/`

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
Local frontend env is loaded through 1Password Developer Environments.

Required local env placeholders:

```env
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
VITE_ALLOWED_EMAILS=YOUR_ALLOWED_EMAILS
VITE_REFRESH_ACCOUNTS_API_URL=YOUR_REFRESH_ACCOUNTS_API_URL
VITE_REFRESH_ACCOUNTS_API_AUTH=YOUR_REFRESH_ACCOUNTS_API_AUTH
VITE_SITE_URL=YOUR_SITE_URL
VITE_DEBUG_MODE=true
```

Important notes:
- Do not expose paid provider keys through `VITE_*`
- `refreshAccounts` depends on the external refresh API auth/env above
- `updateBalance` and `refreshTransactions` currently use Firebase runtime config, not browser env vars

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

## Run Modes
- Dev app: `npm run dev`
- Local frontend only: `npm run dev:local`
- Type check: `npm run type-check`
- Production build: `npm run build`

## Scripts and Ops
- Dev: `npm run dev`
- Build: `npm run build`
- Type check: `npm run type-check`
- Automation check: `npm run check:automation`
- Trigger nightly workflow: `npm run trigger:nightly`
- Watch Netlify deploy after push: `npm run deploy:watch`

Key Functions:
- `refreshAccounts`: calls the external refresh API
- `updateBalance`: pulls checking, savings, and credit-card totals from Monarch and stores account snapshots
- `refreshTransactions`: refreshes recurring Monarch streams into Firestore
- `budgetProjection`: calculates projected checking balances with business-day adjustments
- `syncCalendar`: syncs bills and projected balances to Google Calendar
- `clearCalendars`: clears future events from configured calendars
- `runAll`: orchestrates the nightly automation flow

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
- `/dashboard`: balances, alerts, forecast summary, savings trend, cash flow
- `/transactions`: recurring dataset, filters, edit/create manual transactions, category management
- `/upcoming`: 7-day projection view, transaction search, balance-impact vs excluded display
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
