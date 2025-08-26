#!/bin/bash
# Firebase Functions Configuration Setup
# Run these commands one by one to migrate your Supabase secrets to Firebase

echo "Setting up Firebase Functions configuration..."

# Calendar Sync Configuration (REQUIRED for calendar sync to work)
echo "📅 Setting up Google Calendar configuration..."

# You'll need to get these values from your Supabase secrets:
# 1. GOOGLE_SERVICE_ACCOUNT_JSON - Copy the entire JSON value
echo "Setting Google Service Account JSON..."
echo "⚠️ Replace the JSON below with your actual GOOGLE_SERVICE_ACCOUNT_JSON from Supabase:"
# npx firebase functions:config:set google.service_account_json='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'

# 2. Calendar IDs - Copy from your Supabase secrets
echo "Setting Calendar IDs..."
echo "⚠️ Replace with your actual calendar IDs from Supabase:"
# npx firebase functions:config:set google.dev_balance_calendar_id="your-dev-balance-calendar-id"
# npx firebase functions:config:set google.dev_bills_calendar_id="your-dev-bills-calendar-id" 
# npx firebase functions:config:set google.prod_balance_calendar_id="your-prod-balance-calendar-id"
# npx firebase functions:config:set google.prod_bills_calendar_id="your-prod-bills-calendar-id"

# Email Alert Configuration (FOR LATER - when migrating sendAlert function)
echo "📧 Setting up Email Alert configuration (for later)..."
echo "⚠️ Replace with your actual values from Supabase:"
# npx firebase functions:config:set alert.email="baespey@gmail.com"
# npx firebase functions:config:set resend.api_key="your-resend-api-key"

echo ""
echo "🔍 To get your current Supabase secrets, you can:"
echo "1. Go to your Supabase Dashboard → Settings → Edge Functions → Environment Variables"
echo "2. Or use: supabase secrets list"
echo ""
echo "📝 After setting the config, verify with:"
echo "npx firebase functions:config:get"



