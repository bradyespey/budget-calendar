import { createClient } from "npm:@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function loginToMonarch(email: string, password: string, mfaCode: string) {
  const response = await fetch("https://api.monarchmoney.com/auth/login/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      mfa_token: mfaCode,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to login to Monarch");
  }

  const data = await response.json();
  return data.token;
}

async function getAccountData(token: string, accountId: string) {
  const response = await fetch(`https://api.monarchmoney.com/accounts/${accountId}`, {
    headers: {
      "Authorization": `Token ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch account data");
  }

  return response.json();
}

async function refreshAccount(token: string, accountId: string) {
  const response = await fetch(`https://api.monarchmoney.com/accounts/${accountId}/refresh`, {
    method: "POST",
    headers: {
      "Authorization": `Token ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to refresh account");
  }

  return response.json();
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Get environment variables
    const email = Deno.env.get("MONARCH_EMAIL");
    const password = Deno.env.get("MONARCH_PASSWORD");
    const mfaSecret = Deno.env.get("MONARCH_MFA_SECRET");
    const accountId = Deno.env.get("MONARCH_CHASE_CHECKING_ACCOUNT_ID");

    if (!email || !password || !mfaSecret || !accountId) {
      throw new Error("Missing required environment variables");
    }

    // Login to Monarch
    const token = await loginToMonarch(email, password, mfaSecret);

    // Refresh the account
    await refreshAccount(token, accountId);

    // Get the updated account data
    const account = await getAccountData(token, accountId);

    // Update account in Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error: updateError } = await supabase
      .from("accounts")
      .upsert({
        id: accountId,
        display_name: "Chase Checking",
        last_balance: account.balance,
        last_synced: new Date().toISOString(),
      });

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        balance: account.balance,
        lastSynced: new Date().toISOString()
      }),
      { 
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    console.error("Error refreshing account:", error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
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