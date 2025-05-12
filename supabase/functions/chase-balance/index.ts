//supabase/functions/chase-balance/index.ts
// @ts-nocheck

import { serve } from "https://deno.land/std@0.178.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  // allow `apikey` so browser can pass the anon key
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// service-role credentials
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// admin client (service-role)
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  // handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    // 1) get Monarch token from env
    const token = Deno.env.get("MONARCH_TOKEN");
    if (!token) throw new Error("Missing MONARCH_TOKEN");

    // 2) call Monarch GraphQL
    const monarchRes = await fetch("https://api.monarchmoney.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify({
        operationName: "Web_GetAccountsPage",
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
    if (!monarchRes.ok) throw new Error(`GraphQL error ${monarchRes.status}`);
    const { accountTypeSummaries } = (await monarchRes.json()).data;

    // 3) extract Joint Checking
    const joint = (accountTypeSummaries as any[])
      .flatMap((s) => s.accounts)
      .find((a: any) => a.displayName === "Joint Checking");
    if (!joint) throw new Error("Joint Checking not found");
    const balance = joint.displayBalance as number;

    // 4) persist to Supabase
    const { error: dbError } = await supabaseAdmin
      .from("accounts")
      .upsert(
        {
          id: "joint_checking",
          display_name: "Joint Checking",
          last_balance: balance,
          last_synced: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    if (dbError) throw dbError;

    // 5) return new balance
    return new Response(JSON.stringify({ balance }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("chase-balance error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});