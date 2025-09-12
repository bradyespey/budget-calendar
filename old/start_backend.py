#!/usr/bin/env python3
# old/start_backend.py

import subprocess, os

# assumes you already ran switch_env.py dev
os.chdir(os.path.abspath(os.path.join(__file__,"..","..")))
print("🔸 Starting Supabase local…")
subprocess.run(["supabase","stop"])
subprocess.run(["supabase","start"])