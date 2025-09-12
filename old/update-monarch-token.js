#!/usr/bin/env node
//old/update-monarch-token.js

// Calls your deployed Edge Function to rotate MONARCH_TOKEN

import { execSync } from "child_process";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Load .env.dev so FN and service key are available
dotenv.config({ path: new URL("../.env.dev", import.meta.url).pathname });

const FN   = process.env.VITE_SUPABASE_FUNCTIONS_URL;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY; 
if (!FN || !KEY) {
  console.error("Error: VITE_SUPABASE_FUNCTIONS_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.dev");
  process.exit(1);
}

async function main() {
  // 1) invoke your Edge Function with auth headers
  const res = await fetch(`${FN}/refresh-accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": KEY,
      "Authorization": `Bearer ${KEY}`,
    },
  });
  const json = await res.json();
  if (!res.ok || !json.token) {
    console.error("Failed to rotate token:", json);
    process.exit(1);
  }
  const newToken = json.token;
  console.log("✅ Received new token from Edge Function");

  // 2) persist to Supabase Secrets
  execSync(`supabase secrets set MONARCH_TOKEN="${newToken}"`, { stdio: "inherit" });
  console.log("✅ MONARCH_TOKEN secret updated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});