//supabase/functions/refresh-accounts/index.ts

import { serve } from "https://deno.land/std@0.224/http/server.ts";

serve(async (req: Request) => {
  // no CORS here if you only call from your backend; add headers if needed
  try {
    const { MONARCH_EMAIL, MONARCH_PASSWORD, MONARCH_MFA_SECRET, MONARCH_CHASE_CHECKING_ACCOUNT_ID } =
      Deno.env.toObject();

    if (!MONARCH_EMAIL || !MONARCH_PASSWORD || !MONARCH_MFA_SECRET || !MONARCH_CHASE_CHECKING_ACCOUNT_ID) {
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

    // 2) Trigger a refresh on the account
    const refreshRes = await fetch(
      `https://api.monarchmoney.com/accounts/${MONARCH_CHASE_CHECKING_ACCOUNT_ID}/refresh`,
      {
        method: "POST",
        headers: { Authorization: `Token ${token}` },
      }
    );
    if (!refreshRes.ok) throw new Error("Refresh failed");

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});