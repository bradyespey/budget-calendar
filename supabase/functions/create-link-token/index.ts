import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid@14.0.0';

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
      console.error('Missing credentials:', { 
        hasClientId: !!plaidClientId, 
        hasSecret: !!plaidSecret 
      });
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

    const response = await client.linkTokenCreate({
      user: { client_user_id: 'budget-calendar-user' },
      client_name: 'Budget Calendar',
      products: ['auth'],
      country_codes: ['US'],
      language: 'en',
    });

    return new Response(
      JSON.stringify({ link_token: response.data.link_token }),
      { 
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    console.error('Error creating link token:', error);
    
    return new Response(
      JSON.stringify({ 
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