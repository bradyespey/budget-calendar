#!/bin/bash
set -euo pipefail

EXPECTED_REPO_URL="https://github.com/bradyespey/budget-calendar.git"
EXPECTED_SITE_ID="3539ea32-4ac9-4b7d-8c16-a2025a592ba1"
EXPECTED_SITE_URL="https://budget.theespeys.com"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$PROJECT_ROOT/.netlify"
STATE_FILE="$STATE_DIR/state.json"
LOG_FILE="$(mktemp -t budgetcalendar-netlify-watch.XXXXXX.log)"
trap 'rm -f "$LOG_FILE"' EXIT

require_expected_repo() {
    local remote_url
    remote_url="$(git remote get-url origin)"
    if [ "$remote_url" != "$EXPECTED_REPO_URL" ]; then
        echo "❌ origin remote mismatch."
        echo "Expected: $EXPECTED_REPO_URL"
        echo "Actual:   $remote_url"
        exit 1
    fi
}

ensure_repo_local_state() {
    mkdir -p "$STATE_DIR"
    cat > "$STATE_FILE" <<EOF
{
  "siteId": "$EXPECTED_SITE_ID"
}
EOF
}

ensure_expected_netlify_site() {
    ensure_repo_local_state
    netlify link --id "$EXPECTED_SITE_ID" >/dev/null
}

require_expected_repo
ensure_expected_netlify_site

echo "🚀 Pushing to GitHub..."
git push origin main

echo "✅ Push successful! Streaming Netlify deploy logs..."

set +e
netlify watch 2>&1 | tee "$LOG_FILE"
WATCH_STATUS=${PIPESTATUS[0]}
set -e

if grep -qiE "Build failed|Failed during stage|Error during build|Command failed with exit code" "$LOG_FILE"; then
    echo "❌ Netlify build logs reported a failure."
    exit 1
fi

if [ "$WATCH_STATUS" -ne 0 ]; then
    echo "❌ netlify watch exited with status $WATCH_STATUS"
    exit "$WATCH_STATUS"
fi

if ! grep -q "$EXPECTED_SITE_URL" "$LOG_FILE"; then
    echo "❌ Netlify watch did not report the expected site URL ($EXPECTED_SITE_URL)."
    exit 1
fi

echo "✅ Netlify watch completed without build failure markers."
