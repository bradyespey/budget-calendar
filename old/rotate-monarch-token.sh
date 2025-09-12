# old/rotate-monarch-token.sh

#!/usr/bin/env python3
import os, sys, asyncio
from dotenv import load_dotenv
from monarchmoney import MonarchMoney
from subprocess import run

load_dotenv(dotenv_path=".env.dev")

email, pwd, mfa = os.getenv("MONARCH_EMAIL"), os.getenv("MONARCH_PASSWORD"), os.getenv("MONARCH_MFA_SECRET")
if not all([email, pwd, mfa]):
    sys.exit("Set MONARCH_EMAIL, MONARCH_PASSWORD & MONARCH_MFA_SECRET in .env.dev")

async def main():
    mm = MonarchMoney()
    await mm.login(email=email, password=pwd, mfa_secret_key=mfa, save_session=False, use_saved_session=False)
    await mm.request_accounts_refresh_and_wait()
    return mm.session.token

token = asyncio.run(main())
print("New token:", token)
# Persist it
run(["supabase", "secrets", "set", f"MONARCH_TOKEN={token}"], check=True)
print("✅ MONARCH_TOKEN rotated.")