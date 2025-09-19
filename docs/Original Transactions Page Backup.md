# Original Transactions Page Backup

This is a backup of the original TransactionsPage.tsx before merging with Recurring page logic.

**Backup Date**: September 18, 2025
**Purpose**: Preserve original manual bill management functionality before merge

## Original File Location
`src/pages/TransactionsPage.tsx`

## Key Features
- Manual bill creation, editing, and deletion
- Categories, frequencies, owners, amounts
- Start/end dates for bills
- Monarch status comparison (temporary verification)
- Icon management and customization
- Advanced filtering and sorting
- Mobile-responsive design

## Data Structure
The original page managed `Bill` objects with:
- name, category, amount, frequency, repeats_every
- start_date, end_date, owner, note
- iconUrl, iconType (for custom icons)
- monarch_status (for comparison verification)

## Columns (Original Order)
1. Name (with icon)
2. Category
3. Amount
4. Frequency
5. Start Date
6. End Date
7. Owner
8. Monarch Status
9. Actions (Edit/Delete)

## Monarch Comparison Logic
- Normalized name matching (remove special chars, case insensitive)
- Frequency-aware comparison with repeats_every logic
- Amount matching with tolerance
- Status indicators: ✅ Match, ❌ No Match, ⚠️ Partial

## API Functions Used
- `getBills()`, `createBill()`, `updateBill()`, `deleteBill()`
- `getCategories()` for dynamic category list
- `getRecurringTransactions()` for Monarch comparison
- Icon management: `updateTransactionIcon()`, `resetTransactionIcon()`

## Special UI Features
- Real-time search and filtering
- Column sorting with visual indicators
- Modal forms for create/edit
- Icon picker with brand/generated/custom options
- Mobile-optimized table layout
- Loading states and error handling

## Form Logic
- Dynamic frequency grammar (Every X weeks vs Weekly)
- Category selection with custom option
- Date validation and formatting
- Owner assignment (Both/Brady/Jenny)

## Migration Notes
This functionality was merged into a combined Transactions + Recurring page that:
- Keeps manual "Food & Drinks" and one-time transactions
- Adds Monarch recurring transactions via API
- Combines both data sources in a unified view
- Maintains ability to add manual transactions that don't fit Monarch's system

## File Preserved
The complete original file content was preserved before modifications.
