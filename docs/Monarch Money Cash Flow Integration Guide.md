# Monarch Money Cash Flow Integration Guide

**Scope**: Complete implementation guide for replacing manual transactions with Monarch Money recurring transactions + sophisticated cash flow forecasting

## Overview

Transform your Budget Calendar from manual transaction management to fully automated cash flow forecasting using Monarch Money's recurring transactions API. This guide implements a sophisticated reserve system that shows balance declining smoothly while maintaining perfect accuracy on payment due dates.

**Core Principle**: Only checking debits/credits change the forecast. Card-paid bills accrue as reserves and are not debited until the card payment clears.

## The Problem We're Solving

**Current State:**
- Manual transaction entry in CSV format
- Credit card timing dilemma: show $10K payment early (planning) vs. exact (accuracy)
- Double-counting risk when adding both individual bills AND credit card payments
- Maintenance overhead of updating amounts/frequencies manually

**Target State:**
- Automatic transaction feed from Monarch Money
- Smooth balance decline through daily reserves
- Perfect accuracy on due dates with true-up mechanism
- Zero maintenance once configured

## Architecture Overview

### Data Flow
```
Monarch Recurring API → Mapping Layer → Reserve Calculator → Cash Flow Forecast → Calendar/UI
```

### Key Components
1. **Monarch Integration**: Pull recurring transactions automatically
2. **Payment Method Mapping**: Categorize by `paid_from` (Checking, Chase, Amex, etc.)
3. **Reserve System**: Daily accrual for credit card spending
4. **True-Up Mechanism**: Exact reconciliation on due dates

## Implementation Plan

### Phase 1: Monarch API Integration ✅
**Status**: Completed - we have working GraphQL queries and test page

**Components Built:**
- Firebase function: `getRecurringTransactions`
- Test page: `/recurring-test` with mock data structure
- GraphQL queries (needs refinement for actual recurring data)

### Phase 2: Data Schema Enhancement

**Enhanced Transaction Interface:**
```typescript
interface MonarchTransaction {
  id: string;
  description: string;
  merchant: string;
  amount: number;
  date: string;
  account: string;           // From Monarch
  category: string;
  isRecurring: boolean;
  source: 'monarch';
  
  // Enhanced fields for robust classification
  account_type: 'checking' | 'credit';
  next_occurrence_utc: string;
  monarch_id: string;
  original_amount: number;   // For refunds/adjustments
  
  // Cash flow logic fields
  paid_from: 'Checking' | 'Chase Southwest' | 'Amex' | string;
  is_card_payment: boolean;  // True for actual CC payment transactions
  affects_statement: boolean; // Default true for card-paid items
}
```

**Card Configuration:**
```typescript
interface CardSettings {
  name: string;
  account_name: string;      // Matches Monarch account names
  statement_close_day: number;
  due_day: number;
  baseline_mode: 'rolling_median_3' | 'fixed';
  nonrecurring_baseline: number; // Used when baseline_mode is 'fixed'
}
```

**Reserve Calculation Math:**
```
known_bills_i = sum(card-paid recurring in statement window)
reserve_total_i = known_bills_i + nonrecurring_baseline_i
daily_i = reserve_total_i / days_until_due_i

On due date (in this order):
  + Reserve Release_i = +daily_i * days_accrued
  - Card Payment_i = -statement_total_i
  ± True-Up_i = (statement_total_i − known_bills_i) − nonrecurring_baseline_i
```

**Note**: Reserve Release happens before Payment to avoid temporary overdraft visual.

### Phase 3: Mapping Layer Implementation

**Payment Method Detection:**
```typescript
function mapPaymentMethod(transaction: MonarchTransaction): string {
  // Map Monarch account names to payment methods
  const accountMapping = {
    'Chase Checking': 'Checking',
    'Chase Southwest Credit Card': 'Chase Southwest',
    'American Express': 'Amex',
    // Add other accounts as needed
  };
  
  return accountMapping[transaction.account] || 'Checking';
}
```

**Robust Transaction Classification:**
```typescript
function detectCardPayment(tx: MonarchTransaction): boolean {
  return tx.category === 'Credit Card Payment'
      || tx.account_type === 'credit' && /payment/i.test(tx.description);
}

function isCardPaidBill(tx: MonarchTransaction): boolean {
  return tx.account_type === 'credit' && !detectCardPayment(tx);
}

function classifyTransaction(tx: MonarchTransaction): TransactionType {
  if (detectCardPayment(tx)) {
    return { type: 'card_payment', paid_from: 'Checking' };
  }
  
  if (isCardPaidBill(tx)) {
    return { type: 'card_bill', paid_from: mapPaymentMethod(tx) };
  }
  
  return { type: 'checking_bill', paid_from: 'Checking' };
}
```

**Statement Window Helper:**
```typescript
function statementWindow(d: Date, closeDay: number): [Date, Date] {
  const currentMonth = new Date(d.getFullYear(), d.getMonth(), closeDay);
  const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, closeDay);
  
  // Handle month length edge cases
  if (closeDay > 28) {
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (closeDay > lastDayOfMonth) {
      currentMonth.setDate(lastDayOfMonth);
      nextMonth.setDate(new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate());
    }
  }
  
  return [currentMonth, nextMonth];
}
```

### Phase 4: Reserve System Implementation

**Core Reserve Logic:**
```typescript
class CardReserveSystem {
  private cards: CardSettings[];
  private transactions: MonarchTransaction[];
  
  calculateDailyReserves(): ReserveEntry[] {
    const reserves: ReserveEntry[] = [];
    
    for (const card of this.cards) {
      // Get upcoming bills for this card in current statement cycle
      const upcomingBills = this.getUpcomingBills(card);
      const knownTotal = upcomingBills.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      
      // Add baseline for non-recurring spending
      const reserveTotal = knownTotal + card.nonrecurring_baseline;
      
      // Calculate daily reserve amount
      const daysUntilDue = this.getDaysUntilDue(card);
      const dailyReserve = reserveTotal / daysUntilDue;
      
      // Create daily reserve entries
      for (let day = 1; day <= daysUntilDue; day++) {
        reserves.push({
          date: this.addDays(new Date(), day),
          description: `${card.name} Reserve`,
          amount: -dailyReserve,
          type: 'reserve_accrual',
          card: card.name
        });
      }
      
      // Add due date entries
      const totalAccrued = dailyReserve * daysUntilDue;
      reserves.push({
        date: this.getCardDueDate(card),
        description: `${card.name} Reserve Release`,
        amount: totalAccrued,
        type: 'reserve_release',
        card: card.name
      });
      
      // Actual payment (from Monarch)
      const actualPayment = this.getCardPayment(card);
      if (actualPayment) {
        reserves.push({
          date: this.getCardDueDate(card),
          description: `${card.name} Payment`,
          amount: -actualPayment.amount,
          type: 'card_payment',
          card: card.name
        });
      }
    }
    
    return reserves;
  }
  
  private getUpcomingBills(card: CardSettings): MonarchTransaction[] {
    const [cycleStart, cycleEnd] = statementWindow(new Date(), card.statement_close_day);
    
    return this.transactions.filter(tx => 
      tx.paid_from === card.name &&
      !tx.is_card_payment &&
      this.isInDateRange(tx.date, cycleStart, cycleEnd)
    );
  }
  
  private calculateBaseline(card: CardSettings): number {
    if (card.baseline_mode === 'fixed') {
      return card.nonrecurring_baseline;
    }
    
    // Rolling median of last 3 statements' (statement_total - known_bills)
    const last3Statements = this.getLast3Statements(card);
    const deltas = last3Statements.map(stmt => 
      Math.max(stmt.total - stmt.known_bills, 0)
    );
    
    // Clip to [0, P95] to avoid outliers
    const sorted = deltas.sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const median = sorted[Math.floor(sorted.length / 2)];
    
    return Math.min(Math.max(median, 0), p95);
  }
  
  private guardAgainstEdgeCases(card: CardSettings, daysUntilDue: number): number {
    // Guard against divide-by-zero
    if (daysUntilDue <= 0) {
      return 0;
    }
    
    // Skip reserves if statement is already known and due date is in window
    const knownStatement = this.getKnownStatement(card);
    if (knownStatement && this.isDueDateInWindow(card)) {
      const remainingDays = this.getRemainingDaysInCycle(card);
      return Math.max(knownStatement.total - knownStatement.known_bills, 0) / remainingDays;
    }
    
    return daysUntilDue;
  }
}
```

### Phase 5: Cash Flow Integration

**Update Projection Function:**
```typescript
async function generateCashFlowProjection(): Promise<ProjectionEntry[]> {
  // Get Monarch recurring transactions
  const monarchTransactions = await getMonarchRecurringTransactions();
  
  // Apply payment method mapping
  const mappedTransactions = monarchTransactions.map(tx => ({
    ...tx,
    paid_from: mapPaymentMethod(tx),
    is_card_payment: detectCardPayment(tx),
    affects_statement: !detectCardPayment(tx)
  }));
  
  // Separate checking vs. card transactions
  const checkingTransactions = mappedTransactions.filter(tx => 
    tx.paid_from === 'Checking' && !tx.is_card_payment
  );
  
  const cardTransactions = mappedTransactions.filter(tx => 
    tx.paid_from !== 'Checking' && !tx.is_card_payment
  );
  
  // Generate reserve system entries
  const reserveSystem = new CardReserveSystem(cardSettings, cardTransactions);
  const reserveEntries = reserveSystem.calculateDailyReserves();
  
  // Combine all entries
  const allEntries = [
    ...checkingTransactions.map(tx => ({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      type: 'checking_transaction',
      source: 'monarch'
    })),
    ...reserveEntries
  ];
  
  // Sort by date and return
  return allEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
```

### Phase 6: UI Integration

**Replace TransactionsPage:**
```typescript
// OLD: Manual CSV management
// NEW: Monarch-powered automatic transactions

function RecurringTransactionsPage() {
  const [transactions, setTransactions] = useState<MonarchTransaction[]>([]);
  const [projectionEntries, setProjectionEntries] = useState<ProjectionEntry[]>([]);
  
  useEffect(() => {
    loadMonarchTransactions();
    generateProjection();
  }, []);
  
  // Display transactions grouped by payment method
  // Show reserve calculations
  // Allow manual override for special cases
}
```

**Update Calendar Sync:**
```typescript
// Existing calendar sync works unchanged
// Just feed it the new projection entries instead of manual CSV
const calendarEvents = projectionEntries.map(entry => ({
  date: entry.date,
  title: entry.description,
  amount: entry.amount,
  type: entry.type
}));
```

### Phase 6: Enhanced UI Features

**Per-Card Reserve Visualization:**
```typescript
function CardReserveChip({ card, accrued, expected }) {
  const percentage = (accrued / expected) * 100;
  const isLowBalance = accrued > expected * 0.8; // Flag if >80% accrued
  
  return (
    <div className={`reserve-chip ${isLowBalance ? 'warning' : ''}`}>
      <span className="card-name">{card}</span>
      <span className="amount">${accrued.toFixed(0)} / ${expected.toFixed(0)}</span>
      <div className="progress-bar">
        <div className="fill" style={{ width: `${Math.min(percentage, 100)}%` }} />
      </div>
    </div>
  );
}
```

**Cash Flow View Toggle:**
```typescript
function CashFlowViewToggle() {
  const [viewMode, setViewMode] = useState('checking');
  
  const viewOptions = [
    { value: 'checking', label: 'Checking Only' },
    { value: 'checking-minus-reserves', label: 'Checking - All Reserves' },
    { value: 'per-card', label: 'Per-Card Overlay' }
  ];
  
  return (
    <div className="view-toggle">
      {viewOptions.map(option => (
        <button
          key={option.value}
          className={viewMode === option.value ? 'active' : ''}
          onClick={() => setViewMode(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

**Low-Balance Alert:**
```typescript
function LowBalanceAlert({ projection }) {
  const today = new Date();
  const next30Days = projection.filter(entry => 
    new Date(entry.date) <= addDays(today, 30)
  );
  
  const minBalance = Math.min(...next30Days.map(entry => entry.runningBalance));
  const isLowBalance = minBalance < 1000; // Alert if below $1000
  
  if (!isLowBalance) return null;
  
  return (
    <div className="low-balance-alert">
      ⚠️ Projected balance may drop below $1,000 in next 30 days
      <br />
      Lowest: ${minBalance.toFixed(2)} on {getLowestBalanceDate(next30Days)}
    </div>
  );
}
```

## Configuration Requirements

### Monarch Money Setup
1. **Clean up recurring transactions page in Monarch:**
   - Remove cancelled subscriptions
   - Update frequencies and amounts
   - Ensure all recurring bills are captured
   - Verify account assignments are correct

2. **Account mapping:**
   ```typescript
   const ACCOUNT_MAPPING = {
     'Chase Checking': 'Checking',
     'Chase Southwest Credit Card': 'Chase Southwest',
     'American Express Card': 'Amex',
     // Add other accounts
   };
   ```

### Card Settings Configuration
```typescript
const CARD_SETTINGS: CardSettings[] = [
  {
    name: 'Chase Southwest',
    account_name: 'Chase Southwest Credit Card',
    statement_close_day: 15,  // 15th of each month
    due_day: 10,              // 10th of following month
    nonrecurring_baseline: 500 // Average monthly non-bill spending
  },
  // Add other cards
];
```

### Firebase Function Updates
```typescript
// Update existing getRecurringTransactions function
// Add payment method mapping
// Add reserve calculation logic
// Return enhanced transaction objects
```

## Implementation Steps

### Step 1: Complete Monarch API Integration
- [ ] Fix GraphQL query for recurring transactions
- [ ] Test with real Monarch data
- [ ] Verify all recurring transactions are captured

### Step 2: Build Mapping Layer
- [ ] Add payment method detection
- [ ] Configure account mapping
- [ ] Test transaction classification

### Step 3: Implement Reserve System
- [ ] Build CardReserveSystem class
- [ ] Add daily reserve calculation
- [ ] Test reserve accrual and release logic

### Step 4: Update UI Components
- [ ] Replace manual transaction management
- [ ] Add reserve visualization
- [ ] Show cash flow projection with reserves

### Step 5: Calendar Integration
- [ ] Update calendar sync to use new projection
- [ ] Test calendar events with reserve entries
- [ ] Verify timing accuracy

### Step 6: Testing & Validation
- [ ] Compare projected vs. actual balances
- [ ] Verify no double-counting
- [ ] Test multiple card scenarios
- [ ] Validate true-up calculations

## Benefits of This Approach

### Immediate Benefits
- ✅ **Zero Manual Maintenance**: Transactions update automatically
- ✅ **Perfect Accuracy**: True-up ensures exact reconciliation
- ✅ **Smooth Cash Flow**: Daily reserves show gradual balance decline
- ✅ **Multi-Card Support**: Each card handled independently
- ✅ **No Double-Counting**: Sophisticated logic prevents errors

### Long-Term Benefits
- ✅ **Self-Healing**: Adapts to subscription changes automatically
- ✅ **Scalable**: Easy to add new cards or accounts
- ✅ **Intelligent**: Learns spending patterns over time
- ✅ **Enterprise-Grade**: Sophisticated as commercial cash flow tools

## Technical Architecture

### Data Flow Diagram
```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│   Monarch API   │───▶│  Mapping Layer   │───▶│  Reserve System    │
│  (Recurring)    │    │ (Payment Method) │    │ (Daily Accrual)    │
└─────────────────┘    └──────────────────┘    └────────────────────┘
                                                          │
                                                          ▼
┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│   Calendar UI   │◀───│  Cash Flow       │◀───│   Projection       │
│    & Alerts     │    │  Visualization   │    │   Generator        │
└─────────────────┘    └──────────────────┘    └────────────────────┘
```

### Component Responsibilities
- **Monarch Integration**: Fetch and parse recurring transactions
- **Mapping Layer**: Classify transactions by payment method
- **Reserve System**: Calculate daily accruals and due-date reconciliation
- **Projection Generator**: Combine all transaction types into timeline
- **UI Components**: Display cash flow and allow manual overrides
- **Calendar Sync**: Push events to Google Calendar (unchanged)

## Critical Edge Cases

### 1. Manual Early/Partial Payments
- **Issue**: User pays card early or partially
- **Solution**: Detect via amount mismatch, adjust reserves accordingly
- **Implementation**: Compare actual payment vs. projected, true-up immediately

### 2. Zero-Statement Months & Credit Balances
- **Issue**: No spending in statement cycle or credit balance
- **Solution**: Skip reserves for zero statements, handle credit as negative payment
- **Implementation**: `reserve_total = Math.max(known_bills + baseline, 0)`

### 3. Refunds After Statement Close
- **Issue**: Refund hits card after statement closes but before due date
- **Solution**: Adjust true-up calculation to include post-close refunds
- **Implementation**: Track refunds separately, include in true-up delta

### 4. Weekend/Holiday Due Dates
- **Issue**: Due date falls on weekend, ACH clears next business day
- **Solution**: Adjust due date to next business day for ACH timing
- **Implementation**: `due_date = nextBusinessDay(original_due_date)`

### 5. Late Statement Data
- **Issue**: Statement total arrives after projection window generated
- **Solution**: Regenerate projection when statement data arrives
- **Implementation**: Event-driven projection updates

### 6. Baseline Floor Protection
- **Issue**: Negative baseline from large refunds
- **Solution**: Floor baseline at 0 to avoid negative reserves
- **Implementation**: `baseline = Math.max(calculated_baseline, 0)`

## Data Contract & Idempotency

### Stable Event IDs
```typescript
function generateEventId(tx: MonarchTransaction, type: string): string {
  return `${tx.source}:${tx.monarch_id}:${tx.date}:${type}`;
}
```

### Time Zone Handling
- **Ingest**: Normalize all dates to UTC
- **Display**: Render in user's local timezone
- **Storage**: Store UTC timestamps

### Idempotent Projection Generation
- Use stable event IDs to prevent duplicate entries
- Compare existing projections before regenerating
- Handle partial updates gracefully

## Troubleshooting

### Common Issues
1. **GraphQL Query Errors**: Ensure token is valid and query matches Monarch schema
2. **Account Mapping**: Verify Monarch account names match configuration
3. **Reserve Calculations**: Check card settings (due dates, statement cycles)
4. **Double-Counting**: Ensure card payments are properly flagged
5. **Edge Case Handling**: Monitor for early payments, refunds, zero statements

### Debug Tools
- Reserve calculation preview with per-card breakdown
- Transaction classification report showing mapping decisions
- Cash flow projection comparison (before/after Monarch integration)
- Balance accuracy validation with error reporting
- Edge case detection and alerting

## Acceptance Criteria

### Accuracy Requirements
- ✅ **Forecast Accuracy**: Within $50 over next 30 days on at least 2 cards
- ✅ **No Double-Counting**: Bills moving from Checking to Card don't duplicate
- ✅ **True-Up Validation**: Delta always equals `(S - known_bills) - baseline`
- ✅ **Timing Accuracy**: Reserve Release posted before Payment on due date

### Safety Requirements
- ✅ **Divide-by-Zero Protection**: Handle `daysUntilDue <= 0` gracefully
- ✅ **Baseline Floor**: Never allow negative reserves
- ✅ **Statement Edge Cases**: Handle zero statements and credit balances
- ✅ **Weekend Handling**: Adjust due dates for ACH timing

### Performance Requirements
- ✅ **Idempotent Operations**: Multiple runs produce identical results
- ✅ **Time Zone Consistency**: All dates normalized to UTC
- ✅ **Multi-Card Support**: Handle 5+ cards with overlapping cycles
- ✅ **Real-Time Updates**: Projection updates when statement data arrives

## Future Enhancements

### Smart Baselines
- Machine learning for non-recurring spending patterns
- Seasonal adjustment for variable expenses
- Category-based spending prediction

### Advanced Features
- Multiple statement cycles per card
- Variable due dates
- Integration with other financial accounts
- Spending alerts and budget integration

## Migration Strategy

### Phase 1: Parallel Operation
- Run both manual and Monarch systems side-by-side
- Compare projections for accuracy
- Fine-tune mapping and reserve calculations

### Phase 2: Gradual Transition
- Switch Upcoming page to Monarch data
- Keep manual backup for critical transactions
- Monitor balance accuracy

### Phase 3: Full Migration
- Replace TransactionsPage entirely
- Archive manual transaction system
- Enable full automation

## Success Metrics

### Accuracy Targets
- ✅ Balance projections within $50 of actual
- ✅ Zero double-counted transactions
- ✅ All recurring bills captured automatically
- ✅ Credit card payments timed perfectly

### Efficiency Gains
- ✅ Eliminate weekly transaction updates
- ✅ Reduce manual data entry by 90%+
- ✅ Enable real-time cash flow updates
- ✅ Support unlimited credit cards automatically

---

This guide provides the complete roadmap for transforming your Budget Calendar into a sophisticated, automated cash flow forecasting system using Monarch Money's API with advanced reserve logic for perfect credit card timing.
