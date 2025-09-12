# Budget Calendar Scripts

## Automation Monitoring

### Quick Check
```bash
npm run check:automation
```

### Manual Commands
```bash
# Check GitHub Actions runs
gh run list --workflow="budget-nightly.yml"

# View Firebase Functions logs
firebase functions:log --only nightlyBudgetUpdate

# Trigger manual run
gh workflow run budget-nightly.yml

# Test function directly
curl -X POST "https://us-central1-budgetcalendar-e6538.cloudfunctions.net/nightlyBudgetUpdate" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## What the Automation Does

**Daily at 7:30 AM CT:**
1. **Refresh Accounts** - Calls Flask API to refresh Monarch Money accounts
2. **Update Balance** - Fetches latest Chase balance from Monarch
3. **Run Projections** - Calculates future balance forecasts
4. **Sync Calendar** - Updates Google Calendar with bills and projections
5. **Send Alerts** - Emails success/failure notifications

## Troubleshooting

**If automation fails:**
1. Check GitHub Actions logs for workflow issues
2. Check Firebase Functions logs for function errors
3. Verify Flask API is running at `api.theespeys.com`
4. Check Monarch Money credentials and Chrome profile

**Common issues:**
- **Chrome profile expired** - Re-run setup script
- **Monarch API changes** - Update credentials
- **Firebase timeout** - Check function memory/timeout settings
- **Calendar sync fails** - Verify Google Calendar permissions
