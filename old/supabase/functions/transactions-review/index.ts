//supabase/functions/transactions-review/index.ts

// ── IMPORTS ────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.220.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── MAIN ENTRYPOINT ─────────────────────────────────────────────────────────
serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── FETCH PLAID TOKENS ───────────────────────────────────────────────
    const { data, error } = await supabase.from("plaid_tokens").select("*");
    if (error) throw error;

    return new Response(
      JSON.stringify({ count: data.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("transactions-review error:", err);
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
          subject: 'Budget Calendar App - Transactions Review Error',
          text: `The Transactions Review function failed with error: ${err.message || err}. Please review in the Budget Calendar app at https://budget.theespeys.com.`,
        })
      });
    } catch (e) { console.error('Failed to send error alert:', e); }
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});