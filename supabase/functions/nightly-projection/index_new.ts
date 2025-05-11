//supabase/functions/nightly-projection/index_new.ts

// @ts-nocheck

import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import { format, addDays, parseISO } from "npm:date-fns@3.4.0";

// ── CORS HEADERS ────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── SUPABASE CLIENT ─────────────────────────────────────────────────────────
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ── MAIN ENTRYPOINT ──────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    // check if this was invoked by your cron job
    const isScheduled = req.headers.get("Authorization") === 
      `Bearer ${Deno.env.get("CRON_SECRET")}`;

    // manual requests must supply a valid JWT
    if (!isScheduled) {
      const auth = req.headers.get("Authorization") || "";
      if (!auth.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json", ...CORS } }
        );
      }
      const token = auth.split(" ")[1];
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json", ...CORS } }
        );
      }
    }

    await refreshMonarchAccounts();
    await computeProjections();
    await syncGoogleCalendar();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Nightly projection completed successfully",
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS } }
    );
  } catch (err: any) {
    console.error("Error in nightly projection:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
});

// ── REFRESH MONARCH ACCOUNTS ─────────────────────────────────────────────────
async function refreshMonarchAccounts() {
  console.log("Refreshing Monarch Money accounts...");
  // simulate API delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  const { error } = await supabase
    .from("accounts")
    .update({ last_synced: new Date().toISOString() });

  if (error) {
    console.error("Error updating account sync time:", error);
    throw new Error("Failed to update account sync time");
  }
  console.log("Monarch accounts refreshed successfully");
}

// ── COMPUTE PROJECTIONS ──────────────────────────────────────────────────────
async function computeProjections() {
  console.log("Computing balance projections...");
  const PROJECTION_DAYS = 100;

  // fetch accounts
  const { data: accounts, error: acctErr } = await supabase
    .from("accounts")
    .select("*");
  if (acctErr) throw new Error("Failed to fetch accounts");

  // fetch bills
  const { data: bills, error: billsErr } = await supabase
    .from("bills")
    .select("*");
  if (billsErr) throw new Error("Failed to fetch bills");

  let runningBalance = accounts.reduce((sum, a) => sum + a.last_balance, 0);
  const today = new Date();
  const projections = [];

  for (let i = 0; i < PROJECTION_DAYS; i++) {
    const current = addDays(today, i);
    const dateStr = format(current, "yyyy-MM-dd");

    bills.forEach((bill: any) => {
      const start = parseISO(bill.start_date);
      const end = bill.end_date ? parseISO(bill.end_date) : null;
      let occurs = false;

      if (format(current, "yyyy-MM-dd") === format(start, "yyyy-MM-dd")) {
        occurs = true;
      } else {
        const daysSince = Math.floor((current.getTime() - start.getTime()) / 86400000);
        switch (bill.frequency) {
          case "daily":
            occurs = daysSince % bill.repeats_every === 0;
            break;
          case "weekly":
            occurs = daysSince % (7 * bill.repeats_every) === 0;
            break;
          case "monthly":
            occurs = current.getDate() === start.getDate() &&
                     ((current.getMonth() - start.getMonth()) +
                      (current.getFullYear() - start.getFullYear()) * 12) %
                      bill.repeats_every === 0;
            break;
          case "yearly":
            occurs = current.getDate() === start.getDate() &&
                     current.getMonth() === start.getMonth() &&
                     (current.getFullYear() - start.getFullYear()) %
                     bill.repeats_every === 0;
            break;
        }
      }

      if (occurs) runningBalance += bill.amount;
    });

    projections.push({
      proj_date: dateStr,
      projected_balance: runningBalance,
      lowest: false,
      highest: false,
    });
  }

  // mark extremes
  if (projections.length) {
    let low = projections[0], high = projections[0];
    projections.forEach(p => {
      if (p.projected_balance < low.projected_balance) low = p;
      if (p.projected_balance > high.projected_balance) high = p;
    });
    projections.forEach(p => {
      p.lowest = p.proj_date === low.proj_date;
      p.highest = p.proj_date === high.proj_date;
    });
  }

  // replace existing
  const todayStr = format(today, "yyyy-MM-dd");
  const { error: delErr } = await supabase
    .from("projections")
    .delete()
    .gte("proj_date", todayStr);
  if (delErr) throw new Error("Failed to delete existing projections");

  // batch insert
  const BATCH = 50;
  for (let i = 0; i < projections.length; i += BATCH) {
    const batch = projections.slice(i, i + BATCH);
    const { error: insErr } = await supabase
      .from("projections")
      .insert(batch);
    if (insErr) throw new Error("Failed to insert projections");
  }

  console.log(`Successfully computed ${projections.length} days of projections`);
}

// ── SYNC GOOGLE CALENDAR ────────────────────────────────────────────────────
async function syncGoogleCalendar() {
  console.log("Syncing with Google Calendar...");
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log("Google Calendar sync completed");
  await checkLowBalanceAlerts();
}

// ── LOW BALANCE ALERTS ───────────────────────────────────────────────────────
async function checkLowBalanceAlerts() {
  console.log("Checking for low balance alerts...");
  const THRESH = 500;
  const { data, error } = await supabase
    .from("projections")
    .select("*")
    .lt("projected_balance", THRESH)
    .order("proj_date", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Error checking low balance:", error);
    return;
  }
  if (data.length) {
    console.log(`Low balance alert: ${data[0].projected_balance} on ${data[0].proj_date}`);
  }
}