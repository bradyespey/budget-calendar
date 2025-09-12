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
echo "🔥 Firebase Functions Status:"
if command -v firebase &> /dev/null; then
    echo "  📊 Function Execution Times:"
    
    # Check each function's last execution
           functions=("runAll" "chaseBalance" "budgetProjection" "syncCalendar" "refreshAccounts")
    
    for func in "${functions[@]}"; do
        echo -n "    ${func}: "
        last_execution=$(firebase functions:log --only "$func" | head -5 | grep "Function execution" | head -1 | grep -o "2025-[0-9-]*T[0-9:]*" | head -1)
        
        if [ -n "$last_execution" ]; then
            # Convert to readable format
            formatted_date=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$last_execution" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "$last_execution")
            echo "Last run: $formatted_date"
        else
            echo "❌ No recent executions"
        fi
    done
    
           echo ""
           echo "  📝 Recent runAll logs:"
           firebase functions:log --only runAll | head -10 | grep -E "(Starting|completed|Error|Failed|Step|Function execution)" | tail -5
else
    echo "  ❌ Firebase CLI not installed (install with: npm install -g firebase-tools)"
fi

echo ""
echo "💡 Quick Commands:"
echo "  • Check GitHub Actions: gh run list --workflow=\"budget-nightly.yml\""
echo "  • View Firebase logs: firebase functions:log --only runAll"
echo "  • Manual trigger (GitHub): gh workflow run budget-nightly.yml"
echo "  • Manual trigger (Local): npm run trigger:nightly"
echo "  • Individual function test: npm run dev → Settings → Run All Actions"

echo ""
echo "✨ Automation runs daily at 7:30 AM CT"
