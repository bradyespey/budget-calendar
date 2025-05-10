//supabase/functions/refresh-accounts/index.ts

// @ts-nocheck

import { serve } from "https://deno.land/std@0.178.0/http/server.ts";
import { init, wasm_data, totp } from "https://deno.land/x/totp_wasm/deno/mod.ts";

// initialize the WASM once
await init(wasm_data);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const env = Deno.env.toObject();
    const email = env.MONARCH_EMAIL;
    const pass = env.MONARCH_PASSWORD;
    const secret = env.MONARCH_MFA_SECRET;
    const acctId = env.MONARCH_CHASE_CHECKING_ACCOUNT_ID;
    if (!email || !pass || !secret || !acctId) {
      throw new Error("Missing one or more MONARCH_* env vars");
    }

    // 1) generate TOTP
    const timestamp = Math.floor(Date.now() / 1000);
    const mfaToken = totp(secret, timestamp, 6, 30);

    // 2) login via REST
    const loginRes = await fetch("https://api.monarchmoney.com/auth/login/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: pass,
        mfa_token: mfaToken,
      }),
    });
    const loginJson = await loginRes.json();
    if (!loginRes.ok) {
      throw new Error(`Login failed: ${JSON.stringify(loginJson)}`);
    }
    const token = loginJson.token as string;

    // 3) trigger refresh
    const refreshRes = await fetch(
      `https://api.monarchmoney.com/accounts/${acctId}/refresh`,
      { method: "POST", headers: { Authorization: `Token ${token}` } }
    );
    if (!refreshRes.ok) {
      const errText = await refreshRes.text();
      throw new Error(`Refresh failed: ${errText}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("🚨 refresh-accounts error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});