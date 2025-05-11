//supabase/functions/chase-balance/index.ts

// @ts-nocheck

import { serve } from "https://deno.land/std@0.178.0/http/server.ts";

/* CORS */
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

serve(async req => {
  /* OPTIONS pre-flight */
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    /* ---- env ---- */
    const token = Deno.env.get("MONARCH_TOKEN");
    if (!token) throw new Error("Missing MONARCH_TOKEN");

    /* ---- GraphQL ---- */
    const gql = await fetch("https://api.monarchmoney.com/graphql", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Token ${token}`,   // static API token -- no login needed
      },
      body: JSON.stringify({
        operationName: "Web_GetAccountsPage",
        variables:     {},
        query: `
          query Web_GetAccountsPage {
            accountTypeSummaries {
              accounts { displayName displayBalance }
            }
          }`,
      }),
    });

    if (!gql.ok) throw new Error(`GraphQL error ${gql.status}`);
    const json   = await gql.json();
    const acct   = (json.data.accountTypeSummaries as any[])
                     .flatMap((s) => s.accounts)
                     .find((a: any) => a.displayName === "Joint Checking");
    if (!acct) throw new Error("Joint Checking not found");

    return new Response(
      JSON.stringify({ balance: acct.displayBalance }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (err: any) {
    console.error("💥 chase-balance:", err);
    return new Response(
      JSON.stringify({ error: err.message || "unknown error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});