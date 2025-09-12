# Budget Calendar Project Overview

## Overview
Full-stack financial forecasting web app that syncs real-time checking account balances via Monarch Money API, calculates projected cash flow, and displays upcoming bills/income in a calendar UI. Supports manual updates and automated nightly workflows.

**Migration Status**: Originally built using Python, Flask, Google Apps Script, and Google Sheets, the system has since been fully rebuilt using React, Firebase (previously used Supabase), and modern cloud-native  tooling. The early version parsed spreadsheets and pushed projections to  Google Calendar via GAS.

## Tech Stack
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- **Backend**: Firebase (Firestore, Cloud Functions, Auth)
- **Auth**: Firebase Google OAuth (restricted: baespey@gmail.com, jennycespey@gmail.com, bradyjennytx@gmail.com)
- **External API**: Monarch Money unofficial API [(docs)](https://github.com/hammem/monarchmoney)
- **Hosting**: Netlify (frontend), Firebase (backend)
- **Automation**: GitHub Actions for nightly scheduled jobs

## Core Architecture

### Database Schema (Firestore)
**accounts**: id, displayName, lastBalance, lastSynced
**bills**: id, name, category, amount, frequency, repeatsEvery, startDate, endDate, owner, note
**projections**: lowest, highest, projDate, projectedBalance, bills
**settings**: id, projectionDays, balanceThreshold, calendarMode, manualBalanceOverride, lastProjectedAt

### Key Logic
- Bills on weekends/holidays automatically move to next business day
- Paychecks move back to previous business day
- Daily transactions occur on intended day regardless of weekends/holidays
- Monthly recurring transactions clamp to last day of month if needed

## Workflow

1. **Sign-in**: Google OAuth via Firebase
2. **Account Refresh**: Manual trigger or automated (7:30 AM CT) via Flask API + Selenium
3. **Balance Update**: Fetches live checking balance from Monarch (7:45 AM CT)
4. **Projection Generation**: Reads bill data, generates future balance forecast based on settings.projectionDays
5. **Calendar Sync**: Pushes balance and bill events to Google Calendar
6. **Nightly Automation**: GitHub Actions orchestrates full workflow

## Firebase Functions (us-central1)

- **refreshAccounts**: Triggers Monarch account refresh via Flask API
- **chaseBalance**: Fetches and saves latest Chase balance from Monarch
- **budgetProjection**: Complete projection calculation with complex scheduling logic
- **syncCalendar**: Google Calendar integration with batch processing and duplicate prevention
- **clearCalendars**: Clears all events from Google Calendars
- **sendAlert**: Email alerting via Resend API
- **transactionsReview**: Returns count of items needing review
- **nightlyBudgetUpdate**: Orchestrates full nightly workflow automation
- **generateTransactionIcons**: Creates icons for transactions using brand mapping and AI fallback
- **resetAllTransactionIcons**: Bulk removal of generated icons while preserving custom ones
- **backupTransactionIcons**: Saves all custom icons to Firebase storage for backup
- **restoreTransactionIcons**: Restores icons from Firebase backup
- **getIconBackupInfo**: Returns information about the latest icon backup

## Flask API (api.theespeys.com)

- **refresh_accounts**: Triggers Monarch account refresh via Selenium
- **chase_balance**: Fetches and saves latest Chase balance from Monarch
- **transactions_review**: Returns count of items needing review

## Recent Improvements (September 2025)

### Automation Monitoring System
- **Monitoring Script**: `npm run check:automation` for quick status checks
- **GitHub Actions Integration**: Automated daily runs at 7:30 AM CT
- **Firebase Functions Orchestration**: `nightlyBudgetUpdate` coordinates full workflow
- **Comprehensive Logging**: Tracks all automation steps and errors
- **Manual Commands**: Easy access to all monitoring and testing commands

### Calendar Sync Optimization
- **Batch Processing**: 50-day batches prevent timeouts on large syncs
- **Duplicate Prevention**: Intelligent event comparison prevents duplicate entries
- **Event Cleanup**: Removes outdated events and consolidates duplicates
- **Resource Management**: 9-minute timeout, 1GB memory, rate limiting protection
- **Enhanced Logging**: Detailed progress tracking (processed, created, updated, skipped)

### Firebase Migration Completion
- All Cloud Functions migrated and operational
- Functions consolidated to us-central1 region
- Email alerts restored via Resend API
- GitHub Actions updated for Firebase
- Performance optimizations implemented

### UI/UX Enhancements (December 2024)
- **Enhanced Transaction Management**: Added duplicate transaction functionality with "Copy" naming
- **Advanced Filtering**: Implemented clickable category, frequency, and owner tags for quick filtering
- **Frequency Filter**: Added dedicated frequency dropdown between categories and owners
- **Improved Search**: Enhanced search functionality to include amount/price searching
- **Mobile Optimization**: Improved responsive layout for filter controls on mobile devices
- **Code Cleanup**: Removed excessive debug logging from production code while preserving error logging

### Transaction Icons System
- **Hybrid Icon System**: Brand detection (40+ services), AI generation via OpenAI DALL-E, category fallbacks
- **Custom Icon Management**: Individual icon editing, bulk operations, URL validation
- **Visual Enhancement**: Large, colorful icons with dark mode support
- **Firebase Functions**: generateTransactionIcons, resetAllTransactionIcons for bulk operations
- **Form Integration**: Icon URL field in transaction create/edit forms with duplicate preservation
- **Backup System**: Firebase-based icon backup/restore with timestamp display
- **Scroll Preservation**: Maintains scroll position during all transaction operations with smart adjustment for deletions

## Setup

### 1. Environment Setup
```bash
git clone https://github.com/bradyespey/budget-calendar
cd Budget
make dev
```

### 2. Environment Variables
```env
VITE_FIREBASE_API_KEY=AIzaSyA8PBORjASZYT51SzcFng6itsQRaOYGo7I
VITE_FIREBASE_AUTH_DOMAIN=budgetcalendar-e6538.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=budgetcalendar-e6538
VITE_FIREBASE_STORAGE_BUCKET=budgetcalendar-e6538.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=342823251353
VITE_FIREBASE_APP_ID=1:342823251353:web:6a1e2bd82a1926b5897708
VITE_ALLOWED_EMAILS=baespey@gmail.com,jennycespey@gmail.com,bradyjennytx@gmail.com
VITE_REFRESH_ACCOUNTS_API_URL=https://api.theespeys.com
VITE_DEBUG_MODE=true
```

### 2.1. Debug Mode Setup (Chrome Visibility)
**Simple Configuration** (in API `.env`):
```env
HEADLESS_MODE=False  # Chrome visible for debugging
HEADLESS_MODE=True   # Chrome hidden for normal operation
```

**How Debug Mode Works**:
- **All environments**: Uses `.env` `HEADLESS_MODE` value
- **Toggle as needed**: Change `.env` value and restart Flask app
- **No complex logic**: Simple on/off switch for Chrome visibility

### 2.2. Chrome Profile Setup
**Profile-First Login Strategy:**
1. **Profile Login**: Uses saved Chrome profile (`chrome_profile/monarch_profile`) for fast login
2. **Manual Fallback**: If profile fails, automatically falls back to credential + TOTP login
3. **Setup Script**: Run `setup_chrome_profile.py` to create initial profile
4. **Test Scripts**: Use `test_profile_login.py` and `test_manual_login.py` to verify

**Chrome Profile Structure:**
```
C:\Projects\API\chrome_profile\
├── monarch_profile\         # Persistent profile for account refresh
├── temp_monarch_profile\    # Temporary profile for manual login testing
└── [other endpoints]        # Other automation endpoints
```

### 3. Google OAuth Setup
- **Authorized origins**: budgetcalendar.netlify.app, budget.theespeys.com, localhost:5173
- **Redirect URIs**: budgetcalendar.netlify.app/auth/v1/callback, localhost:5173/auth/v1/callback

### 4. Firebase Configuration
- **Project**: budgetcalendar-e6538
- **Database**: Firestore (us-south1 Dallas region)
- **Functions**: Cloud Functions (us-central1 Iowa region)
- **Hosting**: Netlify (global CDN)

### 5. Resend API Setup
- Sign up at resend.com and create API key
- Verify domain (theespeys.com) in Resend
- Set RESEND_API_KEY in Firebase secrets

### 6. Deployment
```bash
# Deploy functions
npx firebase deploy --only functions

# Deploy frontend
npm run build
# Deploy to Netlify via GitHub integration
```

## Project Structure
```
Budget/
├── src/                    # React frontend
│   ├── components/        # UI components
│   ├── pages/            # App pages (Dashboard, Transactions, Upcoming, Settings)
│   ├── context/          # Auth and balance context
│   ├── api/              # Firebase function calls
│   └── utils/            # Helper functions
├── functions/src/         # Firebase Cloud Functions
├── flask/                 # Flask API server
│   └── app.py            # Main API endpoints
├── docs/                  # Project documentation
├── .github/workflows/     # GitHub Actions automation
└── netlify.toml          # Netlify configuration
```

## App Pages

- **Dashboard**: Current balance and financial status overview
- **Transactions**: Advanced management with duplicate functionality, icon customization, clickable filtering, enhanced search, mobile-optimized layout, scroll preservation
- **Upcoming**: Calendar view of upcoming bills, income, projected balances
- **Settings**: Projection settings, manual triggers, import/export, maintenance functions

## Troubleshooting

- **CORS Issues**: Resolved by using Firebase callable functions (HTTPS onCall)
- **Function Timeouts**: Large operations use batch processing with 9-minute timeout
- **Duplicate Events**: Intelligent comparison prevents duplicates, automatic cleanup removes extras
- **Large Syncs**: 50-day batch processing prevents timeouts on 100+ day operations

## Cost Considerations

- **Firebase**: Free tier covers current usage
- **Netlify**: Free tier for hosting
- **Resend**: Free tier for email alerts
- **Google APIs**: Free tier for Calendar integration

## Monitoring and Maintenance

### Quick Status Check
```bash
npm run check:automation
```

### Manual Commands
- **GitHub Actions**: `gh run list --workflow="budget-nightly.yml"`
- **Firebase Logs**: `firebase functions:log --only nightlyBudgetUpdate`
- **Manual Trigger**: `gh workflow run budget-nightly.yml`
- **Test Function**: `curl -X POST "https://us-central1-budgetcalendar-e6538.cloudfunctions.net/nightlyBudgetUpdate" -H "Content-Type: application/json" -d '{}'`

### Automation Status
- **Schedule**: Daily at 7:30 AM CT (12:30 PM UTC)
- **GitHub Actions**: ✅ Running successfully
- **Firebase Functions**: ✅ Deployed and operational
- **Email Alerts**: ✅ Configured via Resend API

## Next Steps

- Monitor nightly automation performance
- Consider consolidating functions to us-south1 for optimal latency
- Test large calendar syncs (100+ days) for reliability
- Monitor email alert delivery via Resend

## Notes

- **Debug Mode**: Set `HEADLESS_MODE=False` in API `.env` to see Chrome browser
- **Normal Mode**: Set `HEADLESS_MODE=True` in API `.env` to hide Chrome browser
- **Monarch Money**: Uses persistent Chrome profile for login sessions
- **API Integration**: All endpoints use unified Chrome profile strategy

## Contact & Resources

- **GitHub**: https://github.com/bradyespey/budget-calendar
- **Live Site**: https://budget.theespeys.com
- **Firebase Project**: budgetcalendar-e6538
- **Netlify Site**: budgetcalendar