#!/usr/bin/env python3
# setup_chrome_profile.py
# One-time setup to create chrome_profile_monarch with saved Monarch Money login

import os
import sys
import time
import logging
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

# ── Configuration ────────────────────────────────────────────────────────
PROFILE_DIR = "C:\\Projects\\API\\chrome_profile_monarch"
LOGIN_URL = "https://app.monarchmoney.com/login"
ACCOUNTS_URL = "https://app.monarchmoney.com/accounts"

def setup_logging():
    """Set up logging for the setup process"""
    log_dir = 'C:/Projects/API/logs'
    os.makedirs(log_dir, exist_ok=True)
    
    logging.basicConfig(
        filename=os.path.join(log_dir, 'monarch_profile_setup.log'),
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    # Also log to console
    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    formatter = logging.Formatter('%(levelname)s - %(message)s')
    console.setFormatter(formatter)
    logging.getLogger('').addHandler(console)

def ensure_profile_dir():
    """Create profile directory and remove any locks"""
    try:
        os.makedirs(PROFILE_DIR, exist_ok=True)
        print(f"✅ Profile directory created: {PROFILE_DIR}")
        
        # Remove singleton lock if exists
        lock_file = os.path.join(PROFILE_DIR, "SingletonLock")
        if os.path.exists(lock_file):
            try:
                os.remove(lock_file)
                print("🔓 Removed existing browser lock")
            except OSError:
                print("⚠️ Could not remove browser lock (may be in use)")
                
    except Exception as e:
        print(f"❌ Error creating profile directory: {e}")
        raise

def initialize_chrome():
    """Initialize Chrome with the monarch profile"""
    try:
        print("🌐 Initializing Chrome with monarch profile...")
        
        chrome_options = Options()
        
        # Use persistent profile (same structure as food_log)
        chrome_options.add_argument(f"--user-data-dir={PROFILE_DIR}")
        chrome_options.add_argument("--profile-directory=monarch_profile")
        
        # GUI mode for manual login
        chrome_options.add_argument("--start-maximized")
        chrome_options.add_argument("--no-first-run")
        chrome_options.add_argument("--no-default-browser-check")
        
        # Disable password saving prompts
        prefs = {
            "credentials_enable_service": False,
            "profile.password_manager_enabled": False
        }
        chrome_options.add_experimental_option("prefs", prefs)
        
        # Use webdriver-manager for ChromeDriver
        from webdriver_manager.chrome import ChromeDriverManager
        chromedriver_path = ChromeDriverManager().install()
        service = Service(executable_path=chromedriver_path)
        
        driver = webdriver.Chrome(service=service, options=chrome_options)
        print("✅ Chrome initialized successfully")
        return driver
        
    except Exception as e:
        print(f"❌ Failed to initialize Chrome: {e}")
        raise

def setup_monarch_profile():
    """Set up Chrome profile with Monarch Money login"""
    print("🔧 Monarch Money Chrome Profile Setup")
    print("=" * 60)
    print("This will create a persistent Chrome profile with your Monarch Money login")
    print()
    
    setup_logging()
    ensure_profile_dir()
    
    driver = initialize_chrome()
    
    try:
        print("🔐 Navigating to Monarch Money...")
        driver.get(LOGIN_URL)
        time.sleep(2)
        
        print()
        print("=" * 60)
        print("🎯 MANUAL LOGIN REQUIRED")
        print("Please complete the following steps:")
        print("1. Log in to Monarch Money (enter email, password, MFA)")
        print("2. Complete any security challenges")
        print("3. Verify you reach the dashboard/accounts page")
        print("4. Make sure you can see your accounts")
        print("=" * 60)
        print()
        
        input("Press Enter once you've successfully logged in and can see your accounts...")
        
        # Test navigation to accounts page
        print("🧪 Testing saved login...")
        driver.get(ACCOUNTS_URL)
        time.sleep(3)
        
        # Check if we're still logged in
        if "login" in driver.current_url.lower():
            print("❌ Still on login page - session may not have been saved properly")
            print("Please try logging in again and make sure to stay logged in")
            return False
        
        print("✅ Login session saved successfully!")
        print(f"✅ Chrome profile created at: {PROFILE_DIR}")
        print("✅ You can now use the automated refresh script")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during setup: {e}")
        logging.error(f"Setup failed: {e}", exc_info=True)
        return False
    finally:
        try:
            print("🔚 Closing Chrome...")
            driver.quit()
        except:
            pass

def main():
    print("🚀 Monarch Money Chrome Profile Setup")
    print()
    
    if setup_monarch_profile():
        print()
        print("🎉 Setup completed successfully!")
        print()
        print("Next steps:")
        print("1. Test the profile: python test_profile_login.py")
        print("2. Test manual login: python test_manual_login.py") 
        print("3. Use the main script: python refresh_accounts.py")
    else:
        print()
        print("❌ Setup failed")
        print("Check the logs at C:/Projects/API/logs/monarch_profile_setup.log")

if __name__ == "__main__":
    main()
