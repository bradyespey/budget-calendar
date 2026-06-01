#!/bin/bash
# Firebase Functions Configuration Setup
# 
# The functions read server-side values from process.env. Keep real values in
# functions/.env and use functions/.env.example as the placeholder reference.
# After updating functions/.env, redeploy: npx firebase deploy --only functions

echo "BudgetCalendar Firebase Functions environment setup"

echo "Edit functions/.env and fill in the empty placeholders from functions/.env.example."
echo "Required groups:"
echo "- Monarch: MONARCH_TOKEN, MONARCH_CHECKING_ID, MONARCH_SAVINGS_ID"
echo "- Google Calendar: GOOGLE_SERVICE_ACCOUNT_JSON and dev/prod calendar IDs"
echo "- Low balance email: RESEND_API_KEY, LOW_BALANCE_ALERT_EMAIL, RESEND_FROM_EMAIL, BUDGET_CALENDAR_SITE_URL"
echo ""
echo "Then deploy with: npx firebase deploy --only functions"


