# Makefile

.PHONY: dev prod deploy

dev:
	clear
	# LOCAL dev site → http://localhost:5173
	# Reminder: Update Supabase Auth Site URL to http://localhost:5173 before running
	@open "http://localhost:5173/"
	@open "https://supabase.com/dashboard/project/qifbxpqtitmomvwfkvmx/auth/url-configuration"
	@echo "⮀ Starting Vite dev server"
	npm install
	npm run dev

prod:
	clear
	# Production site → https://budgetcalendar.netlify.app
	# Reminder: Update Supabase Auth Site URL to https://budgetcalendar.netlify.app before running
	@open "https://budgetcalendar.netlify.app/"
	@open "https://supabase.com/dashboard/project/qifbxpqtitmomvwfkvmx/auth/url-configuration"
	@echo "⮀ Building production bundle"
	npm run build

deploy:
	clear
	# Deploy Supabase Edge Functions
	@echo "⮀ Deploying Supabase Edge Functions"
	supabase functions deploy refresh-accounts chase-balance transactions-review budget-projection