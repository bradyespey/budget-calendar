#!/bin/bash
# Firebase Functions Configuration Setup
# Run these commands one by one to set up Firebase Functions configuration

echo "Setting up Firebase Functions configuration..."

# Calendar Sync Configuration (REQUIRED for calendar sync to work)
echo "📅 Setting up Google Calendar configuration..."

# 1. GOOGLE_SERVICE_ACCOUNT_JSON - Copy the entire JSON value
echo "Setting Google Service Account JSON..."
echo "⚠️ Replace the JSON below with your actual GOOGLE_SERVICE_ACCOUNT_JSON:"
# npx firebase functions:config:set google.service_account_json='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'

# 2. Calendar IDs
echo "Setting Calendar IDs..."
echo "⚠️ Replace with your actual calendar IDs:"
# npx firebase functions:config:set google.dev_balance_calendar_id="your-dev-balance-calendar-id"
# npx firebase functions:config:set google.dev_bills_calendar_id="your-dev-bills-calendar-id" 
# npx firebase functions:config:set google.prod_balance_calendar_id="your-prod-balance-calendar-id"
# npx firebase functions:config:set google.prod_bills_calendar_id="your-prod-bills-calendar-id"

# Email Alert Configuration (FOR LATER - when migrating sendAlert function)
echo "📧 Setting up Email Alert configuration (for later)..."
echo "⚠️ Replace with your actual values:"
# npx firebase functions:config:set alert.email="your-email@example.com"
# npx firebase functions:config:set resend.api_key="your-resend-api-key"

echo ""
echo "📝 After setting the config, verify with:"
echo "npx firebase functions:config:get"



