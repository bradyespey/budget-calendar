# Makefile

ENV_FILE=.env

.PHONY: dev prod stop

dev:
	clear
	cp .env.dev .env
	npm install
	npm run dev

prod:
	clear
	cp .env.prod .env
	supabase functions deploy refresh-accounts chase-balance transactions-review