# Makefile

# Pick the right supabase/config.toml for dev vs prod
SUPA_CONF     := supabase/config.toml
SUPA_CONF_DEV := supabase/config.dev.toml
SUPA_CONF_PROD:= supabase/config.prod.toml

.PHONY: dev prod deploy

dev:
	clear
	@echo "⮀ Using DEV Supabase config"
	@cp $(SUPA_CONF_DEV) $(SUPA_CONF)
	npm install
	npm run dev

prod:
	clear
	@echo "⮀ Using PROD Supabase config"
	@cp $(SUPA_CONF_PROD) $(SUPA_CONF)
	npm run build
	npx serve dist

deploy:
	clear
	@echo "⮀ Deploying Supabase Edge Functions"
	supabase functions deploy refresh-accounts chase-balance transactions-review nightly-projection