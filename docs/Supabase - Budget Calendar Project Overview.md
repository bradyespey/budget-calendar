**Budget Calendar – Project Overview**

**Overview**
Budget Calendar is a full-stack financial forecasting web app that syncs real-time checking account balances using the Monarch Money API, calculates projected cash flow across time, and displays upcoming bills and income in a clean, calendar-style UI. It allows authenticated users to trigger manual updates or automate a full nightly flow that includes refreshing accounts, fetching the current balance, running projections, and syncing to Google Calendar.

Originally built using Python, Flask, Google Apps Script, and Google Sheets, the 
system has since been fully rebuilt using React, Supabase, and modern cloud-native 
tooling. The early version parsed spreadsheets and pushed projections to Google 
Calendar via GAS. 

**🔥 MIGRATION STATUS (January 2025):** The system is currently being migrated from 
Supabase to Firebase. Core functionality (authentication, data management, projections, 
balance updates) has been successfully migrated and is operational. The complex bill 
scheduling logic has been fully ported and tested. Remaining work includes calendar 
sync, email alerts, and nightly automation functions.

---

**Key Logic Note (Weekends & Holidays)**
- All bills (weekly, monthly, yearly, one-time) that fall on a weekend or holiday are automatically moved to the next available business day (Monday or next non-holiday). Paychecks are moved back to the previous business day (Friday or previous non-holiday). Daily transactions always occur on their intended day, regardless of weekends/holidays. Also, recurring monthly transactions are clamped to the last day of the month if the number of days in the month is less than the recurring date.
- There's also a bill/projection validator with business-day/holiday logic, and concise UI summary (`/src/utils/validateProjections.ts`)

---

**Tech Stack**

* **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
* **Backend**: Firebase (Firestore, Cloud Functions, Auth) - *Migrated from Supabase*
* **Auth**: Firebase Google OAuth (restricted to specific emails: baespey@gmail.com, jennycespey@gmail.com, bradyjennytx@gmail.com)
* **External API**: Monarch Money unofficial API [(docs)](https://github.com/hammem/monarchmoney)
* **Hosting**: Netlify (frontend), Firebase (API/DB/Functions), Google (OAuth)
* **Automation**: GitHub Actions for nightly scheduled jobs *(migration in progress)*

**Migration Status:**
- ✅ **Authentication**: Firebase Auth operational
- ✅ **Database**: Firestore with all data migrated (us-south1 Dallas region)
- ✅ **Core Functions**: Balance updates, projections, account refresh working (us-south1 region)
- ⚠️ **Remaining**: Calendar sync, email alerts, nightly automation
- 📁 **Reference**: Original Supabase functions preserved for remaining migration work

**Region Strategy:**
- **Firestore Database**: us-south1 (Dallas) - optimal for Austin location
- **Cloud Functions**: us-south1 (Dallas) - same region for minimal latency
- **Hosting**: Netlify (global CDN) + Firebase (us-south1 backend)

---

**Database Schema Reference**

Below is a reference for the original Supabase schema and its Firebase Firestore equivalent. 

**Note**: Data has been migrated from PostgreSQL (Supabase) to Firestore (Firebase) with field name conversions from snake_case to camelCase.

**accounts**
| Column         | Type                     | Description                                 |
|---------------|--------------------------|---------------------------------------------|
| id            | text                     | Unique account identifier                   |
| display_name  | text                     | User-friendly account name                  |
| last_balance  | numeric                  | Most recent account balance                 |
| last_synced   | timestamp with time zone | Last time the account was synced            |

**bills**
| Column         | Type      | Description                                              |
|---------------|-----------|----------------------------------------------------------|
| id            | uuid      | Unique bill identifier                                   |
| name          | text      | Bill or income name                                      |
| category      | text      | Bill category (e.g., paycheck, subscription, etc.)        |
| amount        | numeric   | Amount (negative for bills, positive for income)          |
| frequency     | text      | Frequency (daily, weekly, monthly, yearly, one-time)      |
| repeats_every | integer   | Repeat interval (e.g., every 2 weeks)                     |
| start_date    | date      | Start date for the bill/income                            |
| end_date      | date      | Optional end date                                         |
| owner         | text      | Who owns/pays the bill (Both, Brady, Jenny, etc.)         |
| note          | text      | Optional notes or details                                 |

**projections**
| Column            | Type      | Description                                             |
|-------------------|-----------|---------------------------------------------------------|
| lowest            | boolean   | True if this day is the lowest projected balance         |
| highest           | boolean   | True if this day is the highest projected balance        |
| proj_date         | date      | Date of the projection                                  |
| projected_balance | numeric   | Projected balance for the day                           |
| bills             | jsonb     | Array of bills/income applied on this day               |

**settings**
| Column                  | Type                     | Description                                         |
|-------------------------|--------------------------|-----------------------------------------------------|
| id                      | integer                  | Settings row identifier (usually 1)                 |
| projection_days         | integer                  | Number of days to project into the future           |
| balance_threshold       | integer                  | Threshold for low balance alerts                    |
| calendar_mode           | text                     | Calendar sync mode (if applicable)                  |
| manual_balance_override | numeric                  | Manual override for starting balance (if set)       |
| last_projected_at       | timestamp with time zone | Last time projections were run                      |

---

**Architecture & Workflow**

1. **Sign-in**
   * Google OAuth via Supabase, restricted to pre-approved users

2. **Account Refresh**
   * Manual: triggered from Settings → calls `/functions/refresh-accounts`
   * Automated: scheduled via GitHub Actions at 7:30 AM CT
   * Uses Selenium in headless mode to log into Monarch with saved credentials + cookies

3. **Balance Update**
   * Manual: triggered from Settings → calls `/functions/chase-balance`
   * Automated: scheduled via GitHub Actions at 7:45 AM CT
   * Fetches live checking balance from Monarch and persists to Supabase

4. **Projection Generation**
   * Reads bill data from Supabase and generates a future-dated balance forecast based on the `settings.projection_days` value in the settings table
   * Supports manual balance override (`settings.manual_balance_override`); if set, this value is used for projections instead of the live account balance
   * Projections always show today's balance and transactions, but only project future balances starting from tomorrow (today is not projected, but is counted in 'settings.projection_days value')
   * Manual: triggered from Settings or via API
   * Automated: runs after balance update in nightly GitHub Actions
   * All projection and validation logic uses robust weekend/holiday adjustment for all bills (except daily transactions)

5. **Calendar Sync**
   * Pushes all-day balance and bill/income events into Google Calendar based on the projections table
   * Today's calendar event is labeled "Balance: $X"; future days are labeled "Projected Balance: $X"
   * Automated: runs after projections in nightly GitHub Actions

6. **Nightly Job**
   * Fully automated via GitHub Actions workflow (`.github/workflows/budget-nightly.yml`)
   * Each step (refresh accounts, update balance, run projections, sync calendar) is triggered as a separate job step using the Supabase Service Role Key
   * A 90-second wait is included after the refresh step to ensure account balance is updated before proceeding
   * Workflow can be triggered manually from the GitHub Actions tab for testing, or runs nightly on schedule

---

**Troubleshooting Note**

* Supabase Edge Functions cannot reliably call other Edge Functions in the same project. All automation is now orchestrated via GitHub Actions, not via chained Edge Function calls.

---

**Next Steps/Future Work**

* Consider consolidating automation logic into a single backend function if Supabase Edge Function chaining becomes more reliable in the future.

---

## **Setup**

### 1. **Clone & Install**

```bash
git clone https://github.com/bradyespey/budget-calendar
cd Budget
make dev
```

---

### 2. **Google OAuth Setup**

- **Authorized JavaScript origins:**
  - https://budgetcalendar.netlify.app
  - https://qifbxpqtitmomvwfkvmx.supabase.co
  - https://budget.theespeys.com

- **Authorized redirect URIs:**
  - https://qifbxpqtitmomvwfkvmx.supabase.co/auth/v1/callback (GCP only)
  - https://budgetcalendar.netlify.app/auth/v1/callback
  - http://localhost:5173/auth/v1/callback
  - https://budget.theespeys.com/auth/v1/callback

---

### 3. **.env Configuration**  

```env
VITE_SUPABASE_URL=https://qifbxpqtitmomvwfkvmx.supabase.co
VITE_SUPABASE_ANON_KEY=***********   # your anon key
VITE_SUPABASE_FUNCTIONS_URL=https://qifbxpqtitmomvwfkvmx.supabase.co/functions/v1
VITE_ALLOWED_EMAILS=baespey@gmail.com,jennycespey@gmail.com
VITE_REFRESH_ACCOUNTS_API_URL=https://api.theespeys.com
```

---

### 4. **Supabase Secrets**

Set up your Supabase project:

- **Project name:** `budgetcalendar`
- **Project ID:** `qifbxpqtitmomvwfkvmx`
- **Site URL (dev):** `http://localhost:5173`
- **Site URL (prod):** `https://budget.theespeys.com`
- **Redirect URLs:** (see above)

Set secrets in Supabase:

```bash
supabase secrets set \
  SUPABASE_URL="..." \
  SUPABASE_ANON_KEY="..." \
  SUPABASE_SERVICE_ROLE_KEY="..." \
  SUPABASE_DB_URL="..." \
  MONARCH_EMAIL="..." \
  MONARCH_PASSWORD="..." \
  MONARCH_MFA_SECRET="..." \
  MONARCH_TOKEN="..." \
  MONARCH_CHECKING_ID="..." \
  GOOGLE_SERVICE_ACCOUNT_JSON="..." \
  DEV_BALANCE_CALENDAR_ID="..." \
  DEV_BILLS_CALENDAR_ID="..." \
  PROD_BALANCE_CALENDAR_ID="..." \
  PROD_BILLS_CALENDAR_ID="..." \
  GOOGLE_SERVICE_ACCOUNT_JSON="..."
```

Connect to Google Auth from GCP setup and add:

- **Client ID**
- **Client Secret**

---

### 5. **Deploy Functions**

```bash
supabase functions deploy budget-projection chase-balance clear-calendars refresh-accounts send-alert sync-calendar transactions-review
```

---

### 6. **Netlify Setup**

- **Create Netlify project:**  
  - **Site name:** `budgetcalendar`
  - **Site URL:** `budget.theespeys.com`
  - **Connect to GitHub repo:** https://github.com/bradyespey/budget-calendar
  - **Domain management:** Add budget.theespeys.com and set as primary domain

- **Environment variables:**  
  - Add all `VITE_...` values from your `.env` above
  - **Do not include** the non-`VITE_` secrets (`MONARCH_`, `API_AUTH`, etc.) — these are only needed in your Supabase Function secrets

---

### 7. **Netlify Configuration**

**`netlify.toml`:**

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/budget/*"
  to = "/budget/index.html"
  status = 200

[[redirects]]
  from = "/budget"
  to = "/budget/dashboard"
  status = 301

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

### 8. **GitHub Actions Nightly Automation**

- **Workflow file:** `.github/workflows/budget-nightly.yml`
- **Secrets:** Add `SUPABASE_SERVICE_ROLE_KEY` in GitHub repo settings under Actions secrets
- **Schedule:**  
  - 7:30 AM CT: Refresh Accounts  
  - 7:45 AM CT: Update Chase Balance, run Budget Projection, sync Calendar (in order)
- **Manual trigger:** Can also be run from the GitHub Actions tab

### 9. **Alerting**

Budget Calendar now uses [Resend](https://resend.com) for all email alerting (low balance, job failures, etc). Gmail SMTP is no longer used.

**Setup Steps:**
1. **Sign up at [Resend](https://resend.com)** and create an API key.
2. **Verify your sending domain** (e.g., theespeys.com) in Resend. This requires updating DNS records (MX, TXT, etc.) in your DNS provider (e.g., Cloudflare). You must use a verified domain to send alerts to any recipient.
3. **Set Supabase secrets:**

```bash
supabase secrets set \
  RESEND_API_KEY="your-resend-api-key" \
  ALERT_EMAIL="baespey@gmail.com"
```

4. **Update the `from` address** in `supabase/functions/send-alert/index.ts` to use an email at your verified domain (e.g., `alerts@theespeys.com`).
5. **Deploy all functions:**

```bash
supabase functions deploy budget-projection chase-balance clear-calendars refresh-accounts send-alert sync-calendar transactions-review
```

**Result:**
- Real-time low balance alerts
- Job failure notifications
- Reliable email delivery via Resend
- All alert and error emails use a simple, plain-text, standadized format. Each alert includes a direct link: Visit the Budget Calendar app at https://budget.theespeys.com to review.

---

**Code Base Overview**

* **/public/logo.png** – Static logo for favicon and metadata
* **/dist/** – Production build output for deployment

**src/**
* **App.tsx / main.tsx** – App entrypoint and route wiring
* **index.css** – Tailwind and global styles
* **context/**  
  * `AuthContext.tsx` – Handles Firebase auth (migrated from Supabase)
  * `BalanceContext.tsx` – Holds balance + last sync data
* **lib/firebaseConfig.ts** – Firebase client configuration
* **lib/supabase.ts** – Original Supabase client (preserved for reference)
* **api/accounts.ts** – Calls to Firebase Cloud Functions (migrated from Supabase)
* **api/bills.ts** – Bill CRUD operations with Firestore (migrated)
* **api/categories.ts** – Category management with Firestore (migrated)
* **api/projections.ts** – Projection logic with Firebase (migrated)
* **stores/settingsStore.ts** – Zustand store for local app settings
* **components/Layout/**  
  * `Layout.tsx` – Page wrapper layout
  * `Navbar.tsx` – Top navbar with theme + balance
  * `RequireAuth.tsx` – Redirects unauthenticated users
* **components/ui/**  
  * `Button.tsx`, `Card.tsx`, `Input.tsx`, `Select.tsx`, `Spinner.tsx` – Reusable UI components
* **pages/**  
  * `LoginPage.tsx`, `AuthCallback.tsx` – OAuth login and redirect
  * `DashboardPage.tsx` – Balance overview and summary data
  * `TransactionsPage.tsx` – Review and edit transactions
  * `UpcomingPage.tsx` – Calendar-style upcoming events
  * `SettingsPage.tsx` – Manual triggers and import UI
* **utils/importBills.ts** – CSV to DB mapping for bills
* **utils/validateProjections.ts** – Bill/projection validator logic
* **types/**  
  * `index.ts` – Shared TypeScript types
  * `database.ts` – Autogenerated Supabase types

**functions/src/** (Firebase Cloud Functions - Migrated)
* `chaseBalance` – ✅ Fetches and saves the latest Chase account balance from Monarch (working)
* `refreshAccounts` – ✅ Triggers a refresh of Monarch Money accounts via Flask API (working)
* `budgetProjectionV1` – ✅ Complete projection calculation with complex scheduling logic (working)

**supabase/functions/** (Original Edge Functions - Preserved for Reference)
* `refresh-accounts/` – Original account refresh logic
* `chase-balance/` – Original balance update logic  
* `budget-projection/` – Original projection calculation (reference for budgetProjectionV1)
* `sync-calendar/` – Pushes projected balances and bill/income events to Google Calendar
* `clear-calendars/` – Clears all events from the connected Google Calendars
* `send-alert/` – Email alerting via Resend
* `transactions-review/` – Returns a count of unreviewed transactions for review workflows

**.github/workflows/**
* `budget-nightly.yml` – GitHub Actions workflow for nightly automation

**Root Config Files**
* `.env` – Environment variables (Firebase + Supabase configs during migration)
* `firebase.json` – Firebase project configuration
* `.firebaserc` – Firebase project aliases (budgetcalendar-e6538)
* `firestore.rules` – Database security rules
* `functions/package.json` – Cloud Functions dependencies (Node.js 18, us-south1 region)

---

## App Pages Overview

**Dashboard**
- Shows your current account balance and a summary of your financial status at a glance.
- Highlights low balance alerts and key metrics/averages.

**Transactions**
- Lets you add, edit, and search/filter all transactions.

**Upcoming**
- Displays all upcoming bills, income, and projected balances in a calendar-schedule style view.
- Helps you see what's coming up and plan ahead for cash flow.

**Settings**
- Manage projection settings, low balance alerts, and manual balance overrides.
- Trigger manual account refresh, balance update, projections, and calendar sync.
- Extra functions to import/export bills via CSV with sample CSV download, clear calendars, and validate projections.

---

**Calendar Sync Considerations**

For a personal setup (1–2 users), don't stress edge cases unless you frequently change the projection window and expect the calendar to be the absolute ledger. The Upcoming page is your reliable source of truth since the calendars are just mirroring what is there and not doing their own projection logic.

If you want the calendar to always perfectly mirror projections for any range, you can always delete all events in the full projection window before re-inserting every sync.

*Downside:* Slower and more API calls  
*Upside:* Simple, zero duplicates, and fully accurate for any window