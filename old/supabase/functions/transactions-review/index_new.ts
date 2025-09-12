//supabase/functions/transactions-review/index_new.ts

// @ts-nocheck

import { serve } from "https://deno.land/std@0.178.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS HEADERS ────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

// ── MAIN ENTRYPOINT ─────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("plaid_tokens")
      .select("*");
    if (error) throw error;

    return new Response(
      JSON.stringify({ count: data.length }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS } }
    );
  } catch (err: any) {
    console.error("transactions-review error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
});