//supabase/functions/transactions-review/index.ts

import { serve } from "https://deno.land/std@0.178.0/http/server.ts";  // <-- align this!

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Replace "plaid_tokens" with your actual table name if different
    const { data, error } = await supabase.from("plaid_tokens").select("*");
    if (error) throw error;

    return new Response(
      JSON.stringify({ count: data.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});