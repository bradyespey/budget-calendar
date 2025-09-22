# Budget Calendar
**Scope**: This README replaces prior selected overview docs

## Overview
Full-stack financial forecasting web app that syncs real-time checking account balances via Monarch Money API, calculates projected cash flow, and displays upcoming bills/income in a calendar UI. Features intelligent recurring transaction comparison between Monarch Money and manual bills with exact matching validation, frequency-aware date comparison, and comprehensive sorting functionality. Supports manual updates and automated nightly workflows.

Originally built using Python, Flask, Google Apps Script, and Google Sheets, the system has since been fully rebuilt using React, Firebase, and modern cloud-native tooling.

## Live and Admin
- 🌐 **App URL**: https://budget.theespeys.com
- 🔥 **Firebase Console**: budgetcalendar-e6538
- 🚀 **Netlify Dashboard**: budgetcalendar
- ⏰ **GitHub Actions**: Automated nightly runs at 7:30 AM CT
- 🐍 **Flask API**: https://api.theespeys.com

## Tech Stack
- ⚛️ **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- 🔥 **Backend**: Firebase (Firestore, Cloud Functions, Auth)
- 🔐 **Auth**: Firebase Google OAuth (restricted: YOUR_EMAIL, YOUR_EMAIL_2, YOUR_EMAIL_3)
- 💰 **External API**: Monarch Money unofficial API [(docs)](https://github.com/hammem/monarchmoney)
- 🚀 **Hosting**: Netlify (frontend), Firebase (backend)
- ⚙️ **Automation**: GitHub Actions for nightly scheduled jobs

## Quick Start
```bash
git clone https://github.com/bradyespey/budget-calendar
cd Budget
npm install
npm run dev
```

## Environment
Required environment variables:

```env
VITE_FIREBASE_API_KEY=YOUR_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID
VITE_ALLOWED_EMAILS=YOUR_EMAIL,YOUR_EMAIL_2,YOUR_EMAIL_3
VITE_REFRESH_ACCOUNTS_API_URL=https://api.theespeys.com
VITE_DEBUG_MODE=true
```

## Run Modes (Debug, Headless, Profiles)
- 🐛 **Debug Mode**: Set `HEADLESS_MODE=False` in Flask API `.env` to see Chrome browser for debugging
- 👻 **Headless Mode**: Set `HEADLESS_MODE=True` in Flask API `.env` for normal operation (Chrome hidden)
- 🌐 **Chrome Profiles**: Uses persistent Chrome profile (`chrome_profile/monarch_profile`) for fast Monarch Money login with automatic fallback to credential + TOTP login

## Scripts and Ops
- **Development**: `npm run dev` - Start local development server
- **Build**: `npm run build` - Build for production
- **Deploy Functions**: `npx firebase deploy --only functions`
- **Check Automation**: `npm run check:automation` - Quick status check
- **Manual Trigger**: `gh workflow run budget-nightly.yml`
- **Migration**: `npm run migrate` - Migrate data to Firebase
- **Import**: `npm run import:firebase` - Import data to Firebase

### Firebase Functions (us-central1)
**Quick Actions:**
- **refreshAccounts**: Triggers Monarch account refresh via Flask API
- **refreshTransactions**: Fetches recurring transactions with live amounts from Monarch API
- **updateBalance**: Updates Chase balance from external API
- **budgetProjection**: Complete projection calculation with complex scheduling logic
- **syncCalendar**: Google Calendar integration with separate bills/balance calendars, intelligent change detection, and comma-formatted amounts
- **runAll**: Orchestrates full nightly workflow automation

**Maintenance:**
- **validateProjections**: Validates projection data in Firestore
- **clearCalendars**: Clears all events from both dev and prod calendars (bills and balance)
- **generateIcons**: Creates icons for transactions using brand mapping and AI fallback
- **resetAllIcons**: Bulk removal of generated icons while preserving custom ones
- **backupIcons**: Saves all custom icons to Firebase storage for backup
- **restoreIcons**: Restores icons from Firebase backup

### Flask API Endpoints (api.theespeys.com)
- **refresh_accounts**: Triggers Monarch account refresh via Selenium
- **chase_balance**: Fetches and saves latest Chase balance from Monarch
- **transactions_review**: Returns count of items needing review

### Export Endpoints (Monarch Money Integration)
- **GET /export/categories**: CSV export of all transaction categories
- **GET /export/tags**: CSV export of all transaction tags
- **GET /export/transactions**: CSV export of transactions (configurable date range)
- **GET /export/all**: JSON export of everything for Custom GPT integration

## Deploy
- **Frontend**: Automatic via GitHub integration to Netlify
- **Functions**: `npx firebase deploy --only functions`
- **Publish Directory**: `dist`
- **Domains**: budget.theespeys.com (primary), budgetcalendar.netlify.app
- **Build Monitoring**: `npm run deploy:watch` (pushes + watches build completion)

## App Pages / Routes
- **Dashboard**: Current balance and financial status overview with low balance alerts
- **Transactions**: Advanced management with live Monarch data sync, clickable filtering, enhanced search, mobile-optimized layout, comprehensive sorting, sticky headers, clean UI with uniform styling
- **Recurring**: Intelligent comparison between Monarch Money recurring transactions and manual bills with exact matching validation, frequency-aware date comparison, and comprehensive sorting functionality
- **Upcoming**: Calendar view of upcoming bills, income, projected balances
- **Settings**: Projection settings, manual triggers, import/export, maintenance functions with admin timestamps

## Directory Map
```
Budget/
├── src/                    # React frontend
│   ├── components/        # UI components (Button, Card, Input, etc)
│   ├── pages/            # App pages (Dashboard, Transactions, Recurring, Upcoming, Settings)
│   ├── context/          # Auth and balance context providers
│   ├── api/              # Firebase function calls and data access
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Helper functions and validation
├── functions/src/         # Firebase Cloud Functions (us-central1)
├── flask/                 # Flask API server (api.theespeys.com)
│   ├── app.py            # Main API endpoints
│   ├── scripts/          # Selenium automation scripts
│   └── docs/             # Flask-specific documentation
├── scripts/               # Automation and migration scripts
├── .github/workflows/     # GitHub Actions automation
├── netlify.toml          # Netlify configuration
├── firebase.json         # Firebase configuration
└── package.json          # Node.js dependencies and scripts
```

## Troubleshooting
- **CORS Issues**: Resolved by using Firebase callable functions (HTTPS onCall)
- **Function Timeouts**: Large operations use batch processing with 9-minute timeout
- **Duplicate Events**: Intelligent comparison prevents duplicates, automatic cleanup removes extras
- **Large Syncs**: 50-day batch processing prevents timeouts on 100+ day operations
- **Chrome Profile Issues**: Run `setup_chrome_profile.py` to create initial profile for Monarch Money login
- **Migration Issues**: Use `npm run migrate:dry-run` to test data migration before applying
- **Monarch API**: Uses GraphQL `Web_GetAllRecurringTransactionItems` with `recurringTransactionStreams` for live amounts and credit card data
- **Data Matching**: Zero tolerance amount matching, timezone-safe date comparison, frequency-aware matching with repeats_every logic
- **Date Range**: Extended queries (today to 1.5 years) capture all yearly transactions, return next immediate upcoming dates matching Monarch UI exactly
- **Performance**: API caching (5-min TTL), React memoization, debounced search, error boundaries prevent app crashes
- **Loading States**: Fixed infinite loading on Transactions page when using cached data
- **Monarch Status**: Added reverse matching (bills → Monarch) with visual indicators and status filtering

## AI Handoff
Read this README, scan the repo, prioritize core functions and env-safe areas, keep env and rules aligned with this file
