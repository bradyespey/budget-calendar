# Calendar Projection Notes

## Calendar refresh

The Calendar page Refresh action runs the same core projection flow used from Settings:

1. Refresh recurring transactions from Monarch.
2. Recalculate the budget projection.
3. Reload projection days and function timestamps in the UI.

For local testing with Firebase Functions, run the functions emulator and the local-functions Vite script:

```bash
npm run dev:functions
npm run dev:local-functions
```

The local Functions emulator still uses the configured Firebase project data unless Firestore/Auth emulators are also enabled.

## Credit card draft dates

Some credit-card recurring streams have a statement due date that differs from the checking-account draft date. The app stores both dates when a known rule exists:

- `originalDueDate`: the date Monarch reports.
- `checkingImpactDate`: the date used by balance projection.
- `draftRule`: the rule key shown in the Transactions info tooltip.

Current known rules:

- Chase Southwest Credit Card and Amazon Prime Credit draft on the 23rd, moved forward for weekends and federal holidays.
- Apple Card drafts on the 1st of the following month, allowing Saturdays but moving forward for Sundays and federal holidays.
- American Express Credit drafts on the 14th, moved forward for weekends and federal holidays.

These rules are intentionally narrow. Add new rules only after checking recent transaction history against recurring due dates.

## Projection display

Calendar transactions sort by absolute dollar amount so the largest balance-impacting items appear first in month, week, and day views.

The balance projection chart colors line segments by projected balance:

- Green above the low-balance alert threshold.
- Yellow below the threshold and above zero.
- Red below zero.

The savings trend chart uses one blue line for consistency.
