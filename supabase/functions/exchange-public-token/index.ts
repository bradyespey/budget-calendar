import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid@14.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Get Plaid credentials from environment
    const plaidClientId = Deno.env.get("PLAID_CLIENT_ID");
    const plaidSecret = Deno.env.get("PLAID_SANDBOX_SECRET");

    if (!plaidClientId || !plaidSecret) {
      throw new Error("Missing Plaid credentials");
    }

    const configuration = new Configuration({
      basePath: PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': plaidClientId,
          'PLAID-SECRET': plaidSecret,
        },
      },
    });

    const client = new PlaidApi(configuration);

    // Get public token from request body
    const { public_token } = await req.json();
    
    if (!public_token) {
      throw new Error("Missing public token");
    }

    // Exchange public token for access token
    const tokenResponse = await client.itemPublicTokenExchange({
      public_token: public_token
    });

    // Store the access token in the database
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error: dbError } = await supabase
      .from("plaid_tokens")
      .upsert({
        id: 'chase',
        access_token: tokenResponse.data.access_token,
        updated_at: new Date().toISOString(),
      });

    if (dbError) {
      throw new Error("Failed to store access token");
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    console.error('Error exchanging token:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        details: error.response?.data || 'No additional details'
      }),
      { 
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
});