#!/usr/bin/env python3
# old/prod_env.py

import shutil, subprocess, os, sys

# 1) locate project root
ROOT = os.path.abspath(os.path.join(__file__, "..", ".."))
os.chdir(ROOT)

# 2) swap in prod configs
print("\n📦 Switching to PROD configuration…")
shutil.copy("supabase/config.prod.toml", "supabase/config.toml")
shutil.copy(".env.prod", ".env")

# 3) shut down any local dev services
print("🔹 Stopping local Supabase…")
subprocess.run("supabase stop".split(), check=False)

# 4) optional: build & preview production locally
print("✅ Now in PROD mode.")
print("   • To build for Netlify:  npm run build")
print("   • To preview locally:   npm run preview")
print("   • To deploy functions:  supabase functions deploy refresh-accounts chase-balance transactions-review")
print("   • To push to GitHub:    git push origin main\n")