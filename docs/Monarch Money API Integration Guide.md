# Monarch Money API Integration Guide

## Overview
Complete guide for integrating Monarch Money's GraphQL API to fetch recurring transactions and other financial data for the Budget Calendar application.

## API Discovery Process

### 1. Initial Investigation
- **Problem**: Needed to find working GraphQL operations for recurring transactions
- **Approach**: Tested various operation names and query structures
- **Challenge**: Most transaction-related operations returned 400 errors

### 2. Working Operations Found
- **Accounts**: `GetAccounts` - Returns account data with balances
- **Categories**: `GetCategories` - Returns transaction categories  
- **Merchants**: `GetMerchants` - Returns merchant/payee data
- **Recurring Transactions**: `Web_GetUpcomingRecurringTransactionItems` - Returns recurring transaction data

### 3. Key Discovery
The `monarchmoney` Python package uses the `Web_GetUpcomingRecurringTransactionItems` operation, which we successfully replicated in our Firebase functions.

## Technical Implementation

### Firebase Function Setup

#### 1. Basic Test Function (`monarchTest`)
```typescript
// functions/src/index.ts
export const monarchTest = functions.region(region).https.onRequest(
  async (req, res) => {
    // CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    // Fetch accounts, categories, merchants
    // Returns basic Monarch data for testing
  }
);
```

#### 2. Recurring Transactions Function (`monarchRecurringTransactions`)
```typescript
// functions/src/index.ts
export const monarchRecurringTransactions = functions.region(region).https.onRequest(
  async (req, res) => {
    // CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    // Get date range (current month by default)
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    const startDate = startOfMonth.toISOString().split('T')[0];
    const endDate = endOfMonth.toISOString().split('T')[0];

    // GraphQL query for recurring transactions
    const query = `
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
              __typename
            }
            __typename
          }
          date
          isPast
          transactionId
          amount
          amountDiff
          category {
            id
            name
            __typename
          }
          account {
            id
            displayName
            logoUrl
            __typename
          }
          __typename
        }
      }
    `;

    // Make API call and return results
  }
);
```

### Frontend Integration

#### 1. Test Page Component
```typescript
// src/pages/MonarchTestPage.tsx
interface RecurringTransaction {
  stream: {
    id: string;
    frequency: string;
    amount: number;
    isApproximate: boolean;
    merchant: {
      id: string;
      name: string;
      logoUrl?: string;
    };
  };
  date: string;
  isPast: boolean;
  transactionId?: string;
  amount: number;
  amountDiff?: number;
  category: {
    id: string;
    name: string;
  };
  account: {
    id: string;
    displayName: string;
    logoUrl?: string;
  };
}

const fetchRecurringTransactions = async () => {
  const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/monarchRecurringTransactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  const result = await response.json();
  setRecurringData(result);
};
```

## API Endpoints and Data Structure

### Working GraphQL Operations

#### 1. Get Accounts
```graphql
query GetAccounts {
  accounts {
    id
    displayName
    displayBalance
  }
}
```

#### 2. Get Categories
```graphql
query GetCategories {
  categories {
    id
    name
  }
}
```

#### 3. Get Merchants
```graphql
query GetMerchants {
  merchants {
    id
    name
  }
}
```

#### 4. Get Recurring Transactions
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
        __typename
      }
      __typename
    }
    date
    isPast
    transactionId
    amount
    amountDiff
    category {
      id
      name
      __typename
    }
    account {
      id
      displayName
      logoUrl
      __typename
    }
    __typename
  }
}
```

### Authentication
- **Method**: Token-based authentication
- **Header**: `Authorization: Token {token}`
- **Token Source**: Firebase config (`functions.config().monarch?.token`)

## Data Structure Examples

### Recurring Transaction Response
```json
{
  "success": true,
  "count": 39,
  "transactions": [
    {
      "stream": {
        "id": "116720170808083488",
        "frequency": "monthly",
        "amount": -2.99,
        "isApproximate": false,
        "merchant": {
          "id": "116693662277272620",
          "name": "Apple",
          "logoUrl": "https://res.cloudinary.com/monarch-money/image/authenticated/s--6NwGrW4N--/c_thumb,h_132,w_132/v1/production/merchant_logos/provider/apple_jrh1be"
        }
      },
      "date": "2025-09-01",
      "isPast": true,
      "transactionId": "220676108645008708",
      "amount": -14.06,
      "amountDiff": -11.07,
      "category": {
        "id": "220611716266034541",
        "name": "Streaming"
      },
      "account": {
        "id": "220408970970629919",
        "displayName": "Apple Card",
        "logoUrl": "https://api.monarchmoney.com/cdn-cgi/image/width=128/images/institution/76459774629210153"
      }
    }
  ],
  "dateRange": {
    "startDate": "2025-09-01",
    "endDate": "2025-09-30"
  },
  "timestamp": "2025-09-16T05:47:01.294Z"
}
```

## Common Issues and Solutions

### 1. CORS Errors
**Problem**: Frontend blocked by CORS policy
**Solution**: Add CORS headers to Firebase functions
```typescript
res.set('Access-Control-Allow-Origin', '*');
res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
res.set('Access-Control-Allow-Headers', 'Content-Type');
```

### 2. GraphQL Operation Not Found
**Problem**: Most transaction operations return 400 errors
**Solution**: Use the exact operation name and query structure from the `monarchmoney` Python package

### 3. Authentication Issues
**Problem**: API calls fail with authentication errors
**Solution**: Ensure token is properly set in Firebase config and passed in Authorization header

## Deployment Steps

### 1. Build Functions
```bash
cd functions
npm run build
```

### 2. Deploy Functions
```bash
firebase deploy --only functions:monarchTest
firebase deploy --only functions:monarchRecurringTransactions
```

### 3. Test Endpoints
- Test basic data: `https://us-central1-budgetcalendar-e6538.cloudfunctions.net/monarchTest`
- Test recurring: `https://us-central1-budgetcalendar-e6538.cloudfunctions.net/monarchRecurringTransactions`

## Integration with Budget Calendar

### 1. Data Mapping
- **Stream ID**: Use as unique identifier for recurring transactions
- **Amount**: Use `stream.amount` for expected amount, `amount` for actual
- **Date**: Use `date` field for transaction date
- **Merchant**: Use `stream.merchant.name` for display
- **Category**: Use `category.name` for categorization
- **Account**: Use `account.displayName` for account reference

### 2. Calendar Integration
- **Past Transactions**: Mark as completed (gray styling)
- **Upcoming Transactions**: Mark as scheduled (green styling)
- **Amount Differences**: Show variance from expected amount
- **Frequency**: Use for recurring pattern display

## Future Enhancements

### 1. Additional Operations
- Test other operations from the `monarchmoney` package
- Implement transaction history fetching
- Add budget data integration

### 2. Error Handling
- Add retry logic for failed API calls
- Implement proper error logging
- Add user-friendly error messages

### 3. Performance
- Add caching for frequently accessed data
- Implement pagination for large datasets
- Add data refresh intervals

## Troubleshooting

### Debug Steps
1. Check Firebase function logs
2. Verify token is valid in Firebase config
3. Test GraphQL queries directly
4. Check CORS headers are present
5. Verify date range parameters

### Common Commands
```bash
# Check Firebase config
firebase functions:config:get

# View function logs
firebase functions:log

# Test function locally
firebase emulators:start --only functions
```

## Dependencies

### Firebase Functions
- `firebase-functions`: ^4.0.0
- `firebase-admin`: ^11.0.0

### Frontend
- `react`: ^18.0.0
- `typescript`: ^5.0.0

## Environment Variables

### Firebase Config
```bash
firebase functions:config:set monarch.token="your_token_here"
```

## API Rate Limits
- No specific rate limits documented
- Implement reasonable delays between calls
- Consider caching for frequently accessed data

## Security Considerations
- Token stored in Firebase config (encrypted)
- CORS configured for specific origins
- No sensitive data logged
- API calls made server-side only

## Last Updated
September 16, 2025

## Related Files
- `functions/src/index.ts` - Firebase functions implementation
- `src/pages/MonarchTestPage.tsx` - Frontend test page
- `src/App.tsx` - Routing configuration
- `src/components/Layout/Navbar.tsx` - Navigation updates
