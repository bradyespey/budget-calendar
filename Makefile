# Makefile

# –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
#  make dev    → LOCAL dev site (http://localhost:5173)
#  make prod   → BUILD production bundle (https://budgetcalendar.netlify.app)
#  make deploy → Push Supabase Edge Functions
#
#  Reminder: Manually update Supabase Auth Site URL before switching:
#  https://supabase.com/dashboard/project/qifbxpqtitmomvwfkvmx/auth/url-configuration
# –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

.PHONY: dev prod deploy

dev:
	clear
	@open "https://supabase.com/dashboard/project/qifbxpqtitmomvwfkvmx/auth/url-configuration"
	@echo "⮀ Starting Vite dev server"
	npm install
	npm run dev

prod:
	clear
	@open "https://supabase.com/dashboard/project/qifbxpqtitmomvwfkvmx/auth/url-configuration"
	@echo "⮀ Building production bundle"
	npm run build

deploy:
	clear
	@echo "⮀ Deploying Supabase Edge Functions"
	supabase functions deploy refresh-accounts chase-balance transactions-review nightly-projection