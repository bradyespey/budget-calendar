# Makefile

# –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
#  make dev   → LOCAL dev site (http://localhost:5173)
#  make prod  → BUILD production bundle (https://budgetcalendar.netlify.app)
#  make deploy→ Push Supabase Edge Functions
# –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

TEMPLATE    := supabase/config.template.toml
OUTPUT      := supabase/config.toml

.PHONY: dev prod deploy

dev:
	clear
	@echo "⮀ Generating Supabase config for DEV"
	@SITE_URL=http://localhost:5173 \
	  sed "s|{{SITE_URL}}|$$SITE_URL|g" $(TEMPLATE) > $(OUTPUT)
	@echo "⮀ Starting Vite dev server"
	npm install
	npm run dev

prod:
	clear
	@echo "⮀ Generating Supabase config for PROD"
	@SITE_URL=https://budgetcalendar.netlify.app \
	  sed "s|{{SITE_URL}}|$$SITE_URL|g" $(TEMPLATE) > $(OUTPUT)
	@echo "⮀ Building production bundle"
	npm run build

deploy:
	clear
	@echo "⮀ Deploying Supabase Edge Functions"
	supabase functions deploy refresh-accounts chase-balance transactions-review nightly-projection