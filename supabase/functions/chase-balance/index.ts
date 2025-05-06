//supabase/functions/chase-balance/index.ts

import { serve } from "https://deno.land/std@0.224/http/server.ts";

serve(async () => {
  try {
    const { MONARCH_EMAIL, MONARCH_PASSWORD, MONARCH_MFA_SECRET } =
      Deno.env.toObject();

    if (!MONARCH_EMAIL || !MONARCH_PASSWORD || !MONARCH_MFA_SECRET) {
      return new Response("Missing env vars", { status: 500 });
    }

    // 1) Login
    const loginRes = await fetch("https://api.monarchmoney.com/auth/login/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: MONARCH_EMAIL,
        password: MONARCH_PASSWORD,
        mfa_token: MONARCH_MFA_SECRET,
      }),
    });
    if (!loginRes.ok) throw new Error("Login failed");
    const { token } = await loginRes.json();

    // 2) Fetch via GraphQL
    const gqlRes = await fetch("https://api.monarchmoney.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify({
        operationName: "Web_GetAccountsPage",
        variables: {},
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
    if (!gqlRes.ok) throw new Error("GraphQL failed");
    const json = await gqlRes.json();

    // Find “Joint Checking” (or whatever your account is called)
    const account = (json.data.accountTypeSummaries as any[])
      .flatMap((s) => s.accounts)
      .find((a: any) => a.displayName === "Joint Checking");

    if (!account) return new Response("Account not found", { status: 404 });

    return new Response(
      JSON.stringify({ balance: account.displayBalance }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});