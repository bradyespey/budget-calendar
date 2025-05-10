//supabase/functions/chase-balance/index.ts

// @ts-nocheck

import { serve } from "https://deno.land/std@0.178.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const token = Deno.env.get("MONARCH_TOKEN");
    if (!token) throw new Error("No MONARCH_TOKEN found");

    // GraphQL fetch
    const gqlRes = await fetch("https://api.monarchmoney.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify({
        operationName: "Web_GetAccountsPage",
        variables: {},
        query: `
          query Web_GetAccountsPage {
            accountTypeSummaries {
              accounts {
                displayName
                displayBalance
              }
            }
          }
        `,
      }),
    });
    if (!gqlRes.ok) throw new Error(`GraphQL error ${gqlRes.status}`);
    const json = await gqlRes.json();

    const account = (json.data.accountTypeSummaries as any[])
      .flatMap((s) => s.accounts)
      .find((a: any) => a.displayName === "Joint Checking");
    if (!account) throw new Error("Account not found");

    return new Response(
      JSON.stringify({ balance: account.displayBalance }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});