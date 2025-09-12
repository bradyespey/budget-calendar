//supabase/functions/refresh-accounts/index.ts
// @ts-nocheck

import { serve } from "https://deno.land/std@0.178.0/http/server.ts";

// ── CORS HEADERS ────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

// ── MAIN ENTRYPOINT ─────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  try {
    // ── ENV & PARAMS ─────────────────────────────────────────────────---
    const env = Deno.env.toObject();
    const apiAuth = env.API_AUTH!;
    const apiRefreshUrl = env.API_REFRESH_URL!;

    if (!apiAuth || !apiRefreshUrl) {
      throw new Error("Missing API_AUTH or API_REFRESH_URL env vars");
    }

    // ── CALL FLASK ENDPOINT ─────────────────────────────────────────────
    const response = await fetch(apiRefreshUrl, {
      method: "GET",
      headers: {
        "Authorization": "Basic " + btoa(apiAuth),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Flask endpoint failed: ${errorText}`);
    }

    // ── SUCCESS RESPONSE ─────────────────────────────────────────────--
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("refresh-accounts error:", err);
    // Send error alert
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-alert`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: Deno.env.get("ALERT_EMAIL"),
          subject: 'Budget Calendar App - Refresh Accounts Error',
          text: `The Refresh Accounts function failed with error: ${err.message || err}. Please review in the Budget Calendar app at https://budget.theespeys.com.`,
        })
      });
    } catch (e) { console.error('Failed to send error alert:', e); }
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
}); 