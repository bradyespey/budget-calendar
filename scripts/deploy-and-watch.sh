#!/bin/bash

# Deploy and watch Netlify build
# Usage: ./scripts/deploy-and-watch.sh

echo "🚀 Pushing to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ Push successful! Watching Netlify build..."
    netlify watch
else
    echo "❌ Push failed!"
    exit 1
fi


