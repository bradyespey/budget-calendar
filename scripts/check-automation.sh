#!/bin/bash

# Budget Calendar Automation Monitor
# Checks recent GitHub Actions runs and Firebase Functions logs

echo "🔍 Budget Calendar Automation Monitor"
echo ""

# Check GitHub Actions runs
echo "📊 GitHub Actions Status:"
if command -v gh &> /dev/null; then
    gh run list --workflow="budget-nightly.yml" --limit=5 --json status,conclusion,createdAt,displayTitle | jq -r '.[] | "  \(.status == "completed" and .conclusion == "success" | if . then "✅ Success" else "❌ Failed" end) - \(.createdAt | strptime("%Y-%m-%dT%H:%M:%SZ") | strftime("%Y-%m-%d %H:%M"))"'
else
    echo "  ❌ GitHub CLI not installed (install with: brew install gh)"
fi

echo ""
echo "🔥 Firebase Functions Logs:"
if command -v firebase &> /dev/null; then
    firebase functions:log --only nightlyBudgetUpdate | head -20 | grep -E "(nightlyBudgetUpdate|Starting|completed|Error|Failed|Step)" | tail -10
else
    echo "  ❌ Firebase CLI not installed (install with: npm install -g firebase-tools)"
fi

echo ""
echo "💡 Quick Commands:"
echo "  • Check GitHub Actions: gh run list --workflow=\"budget-nightly.yml\""
echo "  • View Firebase logs: firebase functions:log --only nightlyBudgetUpdate"
echo "  • Manual trigger: gh workflow run budget-nightly.yml"
echo "  • Test function: curl -X POST \"https://us-central1-budgetcalendar-e6538.cloudfunctions.net/nightlyBudgetUpdate\" -H \"Content-Type: application/json\" -d \"{}\""

echo ""
echo "✨ Automation runs daily at 7:30 AM CT"
