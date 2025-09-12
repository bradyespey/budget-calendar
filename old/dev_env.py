#!/usr/bin/env python3
# old/dev_env.py

import shutil, subprocess, os, sys

# 1) locate project root
ROOT = os.path.abspath(os.path.join(__file__, "..", ".."))
os.chdir(ROOT)

# 2) swap in dev configs
print("\n📦 Switching to DEV configuration…")
shutil.copy("supabase/config.dev.toml", "supabase/config.toml")
shutil.copy(".env.dev", ".env")

# 3) restart local Supabase
print("🔸 Restarting local Supabase…")
subprocess.run("supabase stop".split(), check=False)
subprocess.run("supabase start".split(), check=True)

# 4) launch Edge Functions + React in one go
print("🚀 Starting Edge Functions (background) + React dev server…\n")
# The '&' backgrounds the first, so both run side-by-side.
cmd = "supabase functions serve & npm run dev"
subprocess.run(cmd, shell=True, check=True)