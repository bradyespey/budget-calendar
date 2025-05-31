import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to, subject, text } = await req.json();

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = "alerts@theespeys.com";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend error: ${err}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    // Send error alert if this isn't a recursive failure
    if (!req.headers.get('X-Alert-Error')) {
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-alert`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            'Content-Type': 'application/json',
            'X-Alert-Error': '1',
          },
          body: JSON.stringify({
            to: Deno.env.get("ALERT_EMAIL"),
            subject: 'Budget Calendar App - Send Alert Error',
            text: `The Send Alert function failed with error: ${error.message || error}. Visit the Budget Calendar app at https://budget.theespeys.com to review.`,
          })
        });
      } catch (e) { console.error('Failed to send error alert:', e); }
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}); 