//supabase/functions/refresh-accounts/index.ts

// @ts-nocheck

import { serve } from "https://deno.land/std@0.178.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const env = Deno.env.toObject();
    const token = env.MONARCH_TOKEN;
    const acctId = env.MONARCH_CHASE_CHECKING_ACCOUNT_ID;
    if (!token || !acctId) throw new Error("Missing MONARCH_TOKEN or MONARCH_CHASE_CHECKING_ACCOUNT_ID");

    // Trigger refresh using the *persisted* token
    const res = await fetch(`https://api.monarchmoney.com/accounts/${acctId}/refresh`, {
      method: "POST",
      headers: { Authorization: `Token ${token}` },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Refresh failed: ${JSON.stringify(err)}`);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});