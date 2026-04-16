# Project Context

Read README.md for full project context before making changes.

## Overview
Financial forecasting app that syncs Monarch data, projects balances, and manages recurring transactions, calendar sync, and automation workflows.

## Stack
React 18, TypeScript, Vite, Tailwind CSS, Firebase Auth/Firestore/Functions, Flask API, Netlify, GitHub Actions.

## Key Files
- src/pages/ (Dashboard, Transactions, Recurring, Upcoming, Settings)
- functions/src/
- flask/app.py
- scripts/
- .github/workflows/

## Dev Commands
- Start: npm run dev
- Build: npm run build
- Deploy: npm run deploy:watch

## Local Ports
- App dev: `http://localhost:5174`
- Netlify local shell: not reserved for this repo right now

## Rules
- Do not introduce new frameworks
- Follow existing structure and naming
- Keep solutions simple and fast

## Notes
- Scheduled automation runs daily via GitHub Actions and orchestrates Firebase Functions.
- Function deploys use: `npx firebase deploy --only functions`.
