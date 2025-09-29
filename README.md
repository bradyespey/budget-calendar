# Budget Calendar
**Scope**: This README replaces prior selected overview docs

## Overview
Full-stack financial forecasting web app that syncs real-time checking account balances via Monarch Money API, calculates projected cash flow, and displays upcoming bills/income in a calendar UI. Features intelligent recurring transaction comparison between Monarch Money and manual bills with exact matching validation, frequency-aware date comparison, comprehensive sorting functionality, automatic weekend/holiday adjustment, and unified data management with intelligent refresh logic. Supports manual updates and automated nightly workflows.

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

### Automation Monitoring
**Quick Check:**
```bash
npm run check:automation
```

**Manual Commands:**
```bash
# Check GitHub Actions runs
gh run list --workflow="budget-nightly.yml"

# View Firebase Functions logs
firebase functions:log --only runAll

# Trigger manual run
gh workflow run budget-nightly.yml

# Test function directly
curl -X POST "https://us-central1-budgetcalendar-e6538.cloudfunctions.net/runAll" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**What the Automation Does (Daily at 7:30 AM CT):**
1. **Refresh Accounts** - Calls Flask API to refresh Monarch Money accounts
2. **Update Balance** - Fetches latest Chase balance from Monarch
3. **Run Projections** - Calculates future balance forecasts
4. **Sync Calendar** - Updates Google Calendar with bills and projections
5. **Send Alerts** - Emails success/failure notifications

### Firebase Functions (us-central1)
**Quick Actions:**
- **refreshAccounts**: Triggers Monarch account refresh via Flask API
- **refreshTransactions**: Intelligent refresh of Monarch transactions with smart comparison (create/update/delete only when needed)
- **updateBalance**: Updates checking and savings balances from Monarch API with historical tracking
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
- **Dashboard**: Checking and savings balances with historical trend chart, projected future balances, spending patterns, and comprehensive financial overview
- **Transactions**: Advanced management with live Monarch data sync, clickable filtering, enhanced search, mobile-optimized layout, comprehensive sorting, sticky headers, clean UI with uniform styling, optimized form performance, category icons, merchant logos, and manual icon input
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

## Historical Context & Migration Notes
- **Supabase Functions Preserved**: All original Supabase functions are kept in `/old/supabase/functions/` for historical reference
- **Migration Policy**: Never modify files in `/old/` directory unless explicitly requested - these serve as historical context
- **Platform Migration**: Successfully migrated from Supabase to Firebase

## Troubleshooting

### Automation Issues
**If automation fails:**
1. Check GitHub Actions logs for workflow issues
2. Check Firebase Functions logs for function errors
3. Verify Flask API is running at `api.theespeys.com`
4. Check Monarch Money credentials and Chrome profile

**Common automation issues:**
- **Chrome profile expired** - Re-run setup script
- **Monarch API changes** - Update credentials
- **Firebase timeout** - Check function memory/timeout settings
- **Calendar sync fails** - Verify Google Calendar permissions

### Technical Issues
- **CORS Issues**: Resolved by using Firebase callable functions (HTTPS onCall)
- **Function Timeouts**: Large operations use batch processing with 9-minute timeout
- **Duplicate Events**: Intelligent comparison prevents duplicates, automatic cleanup removes extras
- **Calendar Clearing**: Fixed pagination and rate limiting - clearCalendars now properly clears all events from today onwards across all 4 calendars in one execution (1.5 min for 105+ events)
- **Large Syncs**: Fixed rate limiting issues - both clearCalendars and syncCalendar now complete all operations in one pass using proper rate limiting with exponential backoff (no more 10-second timeouts)
- **Chrome Profile Issues**: Run `setup_chrome_profile.py` to create initial profile for Monarch Money login
- **Migration Issues**: Use `npm run migrate:dry-run` to test data migration before applying
- **Monarch API**: Uses GraphQL `Web_GetAllRecurringTransactionItems` with `recurringTransactionStreams` for live amounts, credit card data, merchant logos, category icons, and enhanced transaction metadata
- **Data Matching**: Zero tolerance amount matching, timezone-safe date comparison, frequency-aware matching with repeats_every logic
- **Date Range**: Extended queries (today to 1.5 years) capture all yearly transactions, return next immediate upcoming dates matching Monarch UI exactly
- **Weekend/Holiday Adjustment**: Automatic date adjustment for events - paychecks move to previous business day, bills move to next business day, with US holiday API integration
- **Performance**: API caching (5-min TTL), React memoization, debounced search, error boundaries prevent app crashes, optimized form state management
- **Loading States**: Fixed infinite loading on Transactions page when using cached data
- **Monarch Status**: Added reverse matching (bills → Monarch) with visual indicators and status filtering
- **Data Management**: Unified `bills` table as single source of truth, intelligent refresh logic prevents unnecessary updates, removed legacy transaction tables, enhanced with merchant logos, category icons, and credit card payment mapping

## AI Handoff
Read this README, scan the repo, prioritize core functions and env-safe areas, keep env and rules aligned with this file
