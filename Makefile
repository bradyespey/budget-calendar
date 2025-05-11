# Makefile

## Makefile
#  –––––––––––––––––––––––––––––––––––––––––––––––––––––––
#  make dev  → spin up local dev with `SITE_URL=http://localhost:5173`
#  make prod → build a production bundle with `SITE_URL=https://budgetcalendar.netlify.app`
#  make deploy → push your Supabase Edge Functions
#  –––––––––––––––––––––––––––––––––––––––––––––––––––––––

.PHONY: dev prod deploy

dev:
	clear
	@echo "⮀ Starting DEV (http://localhost:5173)"
	@export SITE_URL=http://localhost:5173 && \
	  cp supabase/config.toml supabase/config.toml.bak && \
	  envsubst < supabase/config.toml.bak > supabase/config.toml && \
	  npm install && npm run dev

prod:
	clear
	@echo "⮀ Building PROD bundle"
	@export SITE_URL=https://budgetcalendar.netlify.app && \
	  cp supabase/config.toml supabase/config.toml.bak && \
	  envsubst < supabase/config.toml.bak > supabase/config.toml && \
	  npm run build

deploy:
	clear
	@echo "⮀ Deploying Supabase Edge Functions"
	@supabase functions deploy refresh-accounts chase-balance transactions-review nightly-projection