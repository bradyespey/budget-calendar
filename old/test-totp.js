//old/test-totp.js

import { config } from 'dotenv';
import { authenticator } from 'otplib';

// adjust path if needed
config({ path: new URL('../.env.dev', import.meta.url).pathname });

const secret = process.env.MONARCH_MFA_SECRET;
if (!secret) {
  console.error("No MONARCH_MFA_SECRET loaded");
  process.exit(1);
}

console.log("Current TOTP:", authenticator.generate(secret));