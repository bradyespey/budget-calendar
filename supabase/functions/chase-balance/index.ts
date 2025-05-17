//supabase/functions/chase-balance/index.ts
// @ts-nocheck

import { serve } from "https://deno.land/std@0.178.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS HEADERS ────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  // allow `apikey` so browser can pass the anon key
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ── SUPABASE CLIENT ─────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// admin client (service-role)
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── MAIN ENTRYPOINT ─────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    // ── GET MONARCH TOKEN ────────────────────────────────────────────────
    const token = Deno.env.get("MONARCH_TOKEN");
    if (!token) throw new Error("Missing MONARCH_TOKEN");

    // ── CALL MONARCH GRAPHQL ─────────────────────────────────────────────
    const res = await fetch("https://api.monarchmoney.com/graphql", {
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
              accounts { id displayName displayBalance }
            }
          }
        `,
      }),
    });
    if (!res.ok) throw new Error(`GraphQL error ${res.status}`);

    const { accountTypeSummaries } = (await res.json()).data;
    const accountId = Deno.env.get("MONARCH_CHECKING_ID");
    if (!accountId) throw new Error("Missing MONARCH_CHECKING_ID");
    const checking = (accountTypeSummaries as any[])
      .flatMap(s => s.accounts)
      .find((a: any) => String(a.id) === String(accountId));
    if (!checking) throw new Error("Chase Checking account ID not found");

    // ── UPSERT TO SUPABASE ───────────────────────────────────────────────
    const { error: dbError } = await supabaseAdmin
      .from("accounts")
      .upsert(
        {
          id: "checking",
          display_name: "Chase Checking",
          last_balance: checking.displayBalance,
          last_synced: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    if (dbError) throw dbError;

    // ── RETURN NEW BALANCE ───────────────────────────────────────────────
    return new Response(
      JSON.stringify({ balance: checking.displayBalance }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("chase-balance error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});