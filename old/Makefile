# Makefile

.PHONY: dev prod deploy

dev:
	# LOCAL dev site → http://localhost:5173
	# Reminder: Update Supabase Auth Site URL to http://localhost:5173 before running
	clear
	#@open "http://localhost:5173/"
	#@open "https://supabase.com/dashboard/project/qifbxpqtitmomvwfkvmx/auth/url-configuration"
	@echo "⮀ Starting Vite dev server"
	npm install
	npm run dev

prod:
	# Production site → https://budgetcalendar.netlify.app
	# Reminder: Update Supabase Auth Site URL to https://budgetcalendar.netlify.app before running
	clear
	#@open "https://budgetcalendar.netlify.app/"
	#@open "https://supabase.com/dashboard/project/qifbxpqtitmomvwfkvmx/auth/url-configuration"
	@echo "⮀ Building production bundle"
	npm run build

deploy:
	# Deploy Supabase Edge Functions
	clear
	@echo "⮀ Deploying Supabase Edge Functions"
	supabase functions deploy budget-projection chase-balance clear-calendars refresh-accounts send-alert sync-calendar transactions-review