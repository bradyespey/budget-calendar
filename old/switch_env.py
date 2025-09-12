#!/usr/bin/env python3
# old/switch_env.py

import sys, shutil, os, subprocess

USAGE = """
Usage:
  switch_env.py dev     # switch into DEV mode
  switch_env.py prod    # switch into PROD mode
"""

def copy_file(src, dst):
    print(f"  ↳ {src} → {dst}")
    shutil.copy(src, dst)

def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("dev","prod"):
        print(USAGE)
        sys.exit(1)

    env = sys.argv[1]
    root = os.path.abspath(os.path.join(__file__,"..",".."))
    os.chdir(root)

    print(f"\nSwitching to **{env.upper()}** configuration…")
    copy_file(f"supabase/config.{env}.toml", "supabase/config.toml")
    copy_file(f".env.{env}", ".env")
    print("Done.\n")

    # if you want to auto-stop/start Supabase locally when switching:
    if env == "dev":
        print("Restarting local Supabase…")
        subprocess.run(["supabase","stop"])
        subprocess.run(["supabase","start"])
    print()

if __name__=="__main__":
    main()