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

    // Initialize Plaid client
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

    // Get stored access token
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: tokenData, error: tokenError } = await supabase
      .from("plaid_tokens")
      .select("access_token")
      .eq("id", "chase")
      .single();

    if (tokenError || !tokenData) {
      throw new Error("No access token found");
    }

    // Get account balance from Plaid
    const balanceResponse = await client.accountsBalanceGet({
      access_token: tokenData.access_token,
    });

    // Find the checking account
    const checkingAccount = balanceResponse.data.accounts.find(
      account => account.type === "depository" && account.subtype === "checking"
    );

    if (!checkingAccount) {
      throw new Error("No checking account found");
    }

    // Update the balance in Supabase
    const { error: updateError } = await supabase
      .from("accounts")
      .upsert({
        id: "chase",
        display_name: "Chase Checking",
        last_balance: checkingAccount.balances.current || 0,
        last_synced: new Date().toISOString(),
      });

    if (updateError) {
      throw new Error("Failed to update account balance");
    }

    return new Response(
      JSON.stringify({
        success: true,
        balance: checkingAccount.balances.current,
        lastSynced: new Date().toISOString(),
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    console.error('Error getting balance:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: error.response?.data || 'No additional details',
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