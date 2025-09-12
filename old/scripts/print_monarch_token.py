#!/usr/bin/env python3
# old/scripts/print_monarch_token.py

import os, sys
import requests
import pyotp
from dotenv import load_dotenv

# Load .env.dev (adjust path if your file lives elsewhere)
base = os.path.dirname(__file__)
load_dotenv(dotenv_path=os.path.join(base, "../.env.dev"))

EMAIL   = os.getenv("MONARCH_EMAIL")
PASSWORD= os.getenv("MONARCH_PASSWORD")
SECRET  = os.getenv("MONARCH_MFA_SECRET")

if not all([EMAIL, PASSWORD, SECRET]):
    print("Error: MONARCH_EMAIL, MONARCH_PASSWORD & MONARCH_MFA_SECRET must be in .env.dev", file=sys.stderr)
    sys.exit(1)

# Generate current TOTP code
totp = pyotp.TOTP(SECRET)
mfa_code = totp.now()

LOGIN_MUTATION = """
mutation Web_Login($email: String!, $password: String!, $mfaToken: String!) {
  login(input: { email: $email, password: $password, mfaToken: $mfaToken }) {
    __typename
    ... on LoginSuccess { sessionToken }
    ... on LoginFailure { error { message } }
  }
}
"""

resp = requests.post(
    "https://api.monarchmoney.com/graphql",
    json={"query": LOGIN_MUTATION, "variables": {"email": EMAIL, "password": PASSWORD, "mfaToken": mfa_code}},
    headers={"Content-Type": "application/json"},
)
data = resp.json()

if resp.status_code != 200:
    print("Network error logging in:", data, file=sys.stderr)
    sys.exit(1)

login = data.get("data", {}).get("login", {})
if login.get("__typename") != "LoginSuccess":
    msg = login.get("error", {}).get("message", "Unknown login failure")
    print("Login failed:", msg, file=sys.stderr)
    sys.exit(1)

token = login["sessionToken"]
print(token)