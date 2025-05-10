#!/usr/bin/env python3
# scripts/rotate-monarch-token.py

import os, sys, asyncio
from dotenv import load_dotenv
from monarchmoney import MonarchMoney
from subprocess import run

# Load .env.dev
load_dotenv(dotenv_path=".env.dev")

email = os.getenv("MONARCH_EMAIL")
pwd   = os.getenv("MONARCH_PASSWORD")
mfa   = os.getenv("MONARCH_MFA_SECRET")
if not all([email, pwd, mfa]):
    sys.exit("Missing MONARCH_EMAIL, MONARCH_PASSWORD or MONARCH_MFA_SECRET in .env.dev")

async def main():
    mm = MonarchMoney()
    await mm.login(email=email, password=pwd, mfa_secret_key=mfa, save_session=False, use_saved_session=False)
    # wait for refresh
    await mm.request_accounts_refresh_and_wait()
    return mm.session.token

token = asyncio.run(main())
print("New token:", token)
# Persist in Supabase
run(["supabase", "secrets", "set", f"MONARCH_TOKEN={token}"], check=True)
print("✅ MONARCH_TOKEN rotated.")