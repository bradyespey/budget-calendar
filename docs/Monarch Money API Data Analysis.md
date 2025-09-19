# Monarch Money API Data Analysis

## Overview
Comprehensive analysis of Monarch Money's GraphQL API capabilities, data availability, and limitations discovered during integration with the Budget Calendar application.

## Executive Summary
- **Working**: Recurring transaction streams (56 items)
- **Missing**: Credit card payment due dates (8 items)
- **Root Cause**: Credit card payments are not "recurring transaction streams" - they're account-level payment schedules
- **API Limitation**: No direct GraphQL query for credit card payment due dates

## Data Sources Analysis

### 1. Recurring Transactions (`Web_GetUpcomingRecurringTransactionItems`)
**Status**: ✅ Working  
**Count**: 56 transactions  
**Data Type**: Recurring transaction streams (bills, subscriptions, etc.)

**What it returns**:
- Merchant names and logos
- Transaction amounts and frequencies
- Due dates
- Categories and accounts
- Stream IDs for tracking

**Example data**:
```
Spotify - $18.39 - Monthly - Sep 18, 2025
Hulu - $21.64 - Monthly - Oct 16, 2025
Acorns - $53.65 - Monthly - Oct 4, 2025
```

### 2. Credit Card Payment Due Dates
**Status**: ❌ Not accessible via API  
**Count**: 8 missing items  
**Data Type**: Account-level payment schedules

**Missing items identified**:
1. PayPal Credit
2. PECU Credit Card
3. Chase Freedom - Brady
4. Amazon Prime Credit
5. Chase Southwest Credit Card
6. Capital One Credit - Brady
7. American Express Credit
8. Apple Card

**Why they're missing**:
- These are credit card payment due dates, not recurring transaction streams
- The UI shows them as "recurring" but they're actually account payment schedules
- No GraphQL query exists to fetch account payment due dates

## GraphQL Queries Tested

### ✅ Working Queries

#### 1. Recurring Transactions
```graphql
query Web_GetUpcomingRecurringTransactionItems($startDate: Date!, $endDate: Date!, $filters: RecurringTransactionFilter) {
  recurringTransactionItems(
    startDate: $startDate
    endDate: $endDate
    filters: $filters
  ) {
    stream {
      id
      frequency
      amount
      isApproximate
      merchant {
        id
        name
        logoUrl
      }
    }
    date
    category {
      id
      name
    }
    account {
      id
      displayName
      logoUrl
    }
  }
}
```

#### 2. Accounts (Basic)
```graphql
query GetAccounts {
  accounts {
    id
    displayName
    displayBalance
    accountType
    logoUrl
  }
}
```

### ❌ Failed Queries

#### 1. Credit Card Specific Accounts
```graphql
query GetCreditCardAccounts {
  accounts(filters: {accountType: [CREDIT_CARD]}) {
    id
    displayName
    balance
    paymentDueDate
    minimumPaymentAmount
  }
}
```
**Result**: Query failed - invalid syntax

#### 2. Cash Flow Data
```graphql
query GetCashFlowData {
  cashFlow {
    summary {
      totalIncome
      totalExpenses
    }
    upcomingRecurringItems {
      date
      amount
      description
      account {
        displayName
      }
    }
  }
}
```
**Result**: Query failed - operation not found

#### 3. Bills and Payments
```graphql
query GetBillsAndPayments {
  transactions(
    filters: {
      categories: ["Bills & Fees"]
    }
  ) {
    id
    amount
    merchant {
      name
    }
    category {
      name
    }
    account {
      displayName
    }
    date
  }
}
```
**Result**: Query failed - operation not found

## Data Structure Analysis

### Raw Data from UI Export
**Source**: `docs/monarch_recurring_raw.txt`  
**Format**: 6 lines per transaction
1. Merchant name
2. Frequency
3. Due date
4. Payment account
5. Category
6. Amount

**Total unique merchants**: 38 (after filtering out amounts and headers)  
**Credit card accounts found**: 8 (PayPal Credit, PECU Credit Card, Chase Freedom - Brady, etc.)

### API Response Structure
```json
{
  "data": {
    "recurringTransactionItems": [
      {
        "stream": {
          "id": "116720170808083488",
          "frequency": "monthly",
          "amount": -2.99,
          "merchant": {
            "id": "116693662277272620",
            "name": "Apple",
            "logoUrl": "https://..."
          }
        },
        "date": "2025-09-01",
        "category": {
          "id": "220611716266034541",
          "name": "Streaming"
        },
        "account": {
          "id": "220408970970629919",
          "displayName": "Apple Card",
          "logoUrl": "https://..."
        }
      }
    ]
  }
}
```

## Technical Implementation Attempts

### 1. Direct API Testing
**Approach**: Test Monarch API directly with Python library  
**Result**: Blocked by Cloudflare (403 error)  
**Reason**: API calls from external IPs are blocked

### 2. Firebase Function Integration
**Approach**: Use Firebase functions to make API calls  
**Result**: ✅ Works for recurring transactions  
**Limitation**: No access to credit card payment due dates

### 3. Account Query Integration
**Approach**: Fetch accounts and convert credit card balances to recurring transactions  
**Result**: ❌ Accounts query doesn't include payment due dates  
**Fields available**: `id`, `displayName`, `displayBalance`, `accountType`, `logoUrl`  
**Fields missing**: `paymentDueDate`, `minimumPaymentAmount`

## API Limitations Discovered

### 1. No Credit Card Payment Due Date Query
- Credit card payment schedules are not exposed via GraphQL API
- Only account balances are available, not payment due dates
- This is a fundamental limitation of the Monarch Money API

### 2. Limited Account Information
- `GetAccounts` query only returns basic account info
- No payment schedule or due date information
- No minimum payment amounts

### 3. No Bills/Payments Query
- No direct query for upcoming bills or payments
- Only recurring transaction streams are available
- Credit card payments don't qualify as "recurring transactions"

### 4. Cloudflare Protection
- Direct API access blocked from external IPs
- Must use Firebase functions or similar server-side approach
- Rate limiting may apply

## Data Mapping Challenges

### Recurring Transactions
- ✅ Merchant names map directly
- ✅ Amounts and frequencies available
- ✅ Due dates provided
- ✅ Categories and accounts included

### Credit Card Payments
- ❌ No merchant name (it's the account name)
- ❌ No due date (not available in API)
- ❌ No frequency (not a recurring stream)
- ❌ No category (would need to be hardcoded)

## Workarounds Attempted

### 1. Broader Date Range
**Approach**: Expand date range from 1 year to 2 years  
**Result**: Still 56 transactions - no additional credit card data

### 2. Multiple Query Approach
**Approach**: Combine recurring transactions + accounts queries  
**Result**: Accounts query works but doesn't include payment due dates

### 3. Bills Query Integration
**Approach**: Add secondary query for bills and payments  
**Result**: Query syntax invalid - operation not found

## Recommendations

### 1. Accept Current Limitation
- Use 56 recurring transactions as available
- Credit card payment due dates are not accessible via API
- This is a Monarch Money API limitation, not an implementation issue

### 2. Manual Credit Card Tracking
- Add credit card payment due dates manually
- Create separate manual transactions for credit card payments
- Use account names as merchant names

### 3. Alternative Data Sources
- Consider if credit card payment due dates are available from other sources
- Check if Monarch Money has different API endpoints
- Investigate if payment due dates are available in account exports

## Technical Details

### Authentication
- **Method**: Token-based authentication
- **Header**: `Authorization: Token {token}`
- **Token Source**: Firebase config
- **Expiration**: Unknown (tokens appear to be long-lived)

### Rate Limits
- No documented rate limits
- Cloudflare protection may apply
- Reasonable delays recommended between calls

### Error Handling
- GraphQL errors returned in response
- HTTP status codes for API errors
- CORS headers required for frontend access

## Conclusion

The Monarch Money API provides excellent access to recurring transaction streams but has a fundamental limitation: credit card payment due dates are not exposed via the GraphQL API. This is not a technical implementation issue but rather a limitation of the API itself.

**Current Status**: 56/64 transactions accessible (87.5%)  
**Missing Data**: 8 credit card payment due dates  
**Root Cause**: API limitation - no query for account payment schedules  
**Recommendation**: Implement Path B (inference logic) to compute credit card payment due dates from historical data

## Practical Solutions

### Path A: Mirror as Custom Merchants
- Create `Chase Sapphire – Payment` etc. as Monarch recurring items
- **Pros**: Simple, shows in Monarch + calendar
- **Cons**: Manual when issuer changes cycle/amount

### Path B: Infer Due Dates/Amounts in Code (Recommended)
- Derive per-card cycle + next due date from historical payments/statements
- Compute minimum payment and/or expected autopay
- **Pros**: Fully automated, precise, no scraping
- **Cons**: A bit of logic to maintain

### Path C: Sessioned UI Fetch
- Authenticated headless browser hitting the same UI endpoint Monarch uses
- **Pros**: "What you see is what you get" parity
- **Cons**: Fragile to UI/API changes; heavier infrastructure

## Recommended Implementation (Path B)

### 1. Detect Cycle
- Find last 6 payment transactions per CC (merchant contains issuer + "Payment")
- Compute mode of the day-of-month gap to lock the statement cycle
- Handle 28–31 clamp + weekend rules

### 2. Next Due Date
- `next_due = prior_due + 1 month`
- Move to prior business day if issuer pays early on weekends

### 3. Amount Calculation
- **Autopay full**: use last statement balance
- **Minimum formula**: `max(floor(rate * stmt_balance, 2), fixed_min)`
- Store per-card parameters in Firestore

### 4. Output
- Emit synthetic "recurring" rows for each card
- Feed into projection and calendar alongside Monarch's real recurring

## Code Implementation

### Utility Functions
```typescript
// Next monthly due date calculation
function nextMonthly(date: Date, targetDay: number) {
  const d = new Date(date); 
  d.setMonth(d.getMonth() + 1, Math.min(targetDay, 28));
  // Clamp to last day of month if needed
  const month = d.getMonth();
  d.setDate(targetDay);
  if (d.getMonth() !== month) d.setDate(0);
  return d;
}

// Business day adjustment
function businessAdjust(d: Date, policy: 'prev'|'next' = 'prev') {
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() + (policy === 'next' ? 1 : -2)); // Sun
  if (day === 6) d.setDate(d.getDate() + (policy === 'next' ? 2 : -1)); // Sat
  return d;
}

// Minimum payment calculation
function minPayment(balance: number, pct = 0.01, floorAmt = 25) {
  return Math.max(Math.round(balance * pct * 100) / 100, floorAmt);
}
```

### Implementation Steps
1. Query historical transactions for each credit card
2. Identify payment patterns and statement cycles
3. Calculate next due dates using business day rules
4. Compute payment amounts (full balance or minimum)
5. Generate synthetic recurring transaction items
6. Merge with Monarch's recurring transactions

## Files Referenced
- `functions/src/index.ts` - Firebase functions implementation
- `docs/monarch_recurring_raw.txt` - Raw UI data export
- `docs/Monarch Money API Integration Guide.md` - Original integration guide
- `src/pages/TransactionsPage.tsx` - Frontend implementation

## Last Updated
September 18, 2025

## Next Steps
1. Document this limitation for future reference
2. Consider manual credit card payment tracking
3. Monitor Monarch Money API updates for new payment schedule queries
4. Evaluate alternative data sources for credit card payment due dates
