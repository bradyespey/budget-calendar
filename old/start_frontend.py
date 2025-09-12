#!/usr/bin/env python3
# old/start_frontend.py

import subprocess, os

root = os.path.abspath(os.path.join(__file__,"..",".."))
os.chdir(root)
print("📦 npm install && vite dev…")
subprocess.run(["npm","install"])
subprocess.run(["npm","run","dev"])