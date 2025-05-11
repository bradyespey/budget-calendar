# Pick the right .env and supabase/config.toml for dev vs prod
ENV_FILE        := .env
SUPA_CONF       := supabase/config.toml
SUPA_CONF_DEV   := supabase/config.dev.toml
SUPA_CONF_PROD  := supabase/config.prod.toml

.PHONY: dev prod stop

dev:
	@echo "⮀ Switching to DEV settings"
	@cp .env.dev $(ENV_FILE)
	@cp $(SUPA_CONF_DEV) $(SUPA_CONF)
	@echo "⮀ Starting React + Supabase Dev"
	npm install
	npm run dev

prod:
	@echo "⮀ Switching to PROD settings"
	@cp .env.prod $(ENV_FILE)
	@cp $(SUPA_CONF_PROD) $(SUPA_CONF)
	@echo "⮀ Deploying Supabase Edge Functions"
	supabase functions deploy refresh-accounts chase-balance transactions-review nightly-projection