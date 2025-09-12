#!/usr/bin/env python3
# old/serve_functions.py

import subprocess, os

os.chdir(os.path.abspath(os.path.join(__file__,"..","..")))
print("🔹 Serving Edge Functions…")
subprocess.run(["supabase","functions","serve"])