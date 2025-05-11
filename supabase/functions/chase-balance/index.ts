//supabase/functions/chase-balance/index.ts

// @ts-nocheck

import { serve } from "https://deno.land/std@0.178.0/http/server.ts";

// ── CORS headers ─────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const token = Deno.env.get("MONARCH_TOKEN");
    if (!token) throw new Error("Missing MONARCH_TOKEN");

    const res = await fetch("https://api.monarchmoney.com/graphql", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Token ${token}`,
      },
      body: JSON.stringify({
        operationName: "Web_GetAccountsPage",
        query: `
          query Web_GetAccountsPage {
            accountTypeSummaries {
              accounts { displayName displayBalance }
            }
          }
        `,
      }),
    });
    if (!res.ok) throw new Error(`GraphQL error ${res.status}`);

    const { accountTypeSummaries } = (await res.json()).data;
    const joint = (accountTypeSummaries as any[])
      .flatMap(s => s.accounts)
      .find((a: any) => a.displayName === "Joint Checking");
    if (!joint) throw new Error("Joint Checking not found");

    return new Response(
      JSON.stringify({ balance: joint.displayBalance }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("chase-balance error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});