//supabase/functions/sync-calendar/index.ts

import { serve } from "https://deno.land/std@0.220.1/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { google } from "npm:googleapis"
import { addDays, format, parseISO } from "https://esm.sh/date-fns@3.4.0"

// ── CORS HEADERS ────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── MAIN ENTRYPOINT ─────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    // ── GOOGLE AUTH ─────────────────────────────────────────────────────
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) throw new Error("Missing Google service account secret");
    let key;
    try {
      key = JSON.parse(serviceAccountJson);
    } catch (e) {
      console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:", e);
      throw e;
    }
    const auth = new google.auth.JWT(
      key.client_email,
      undefined,
      key.private_key,
      ["https://www.googleapis.com/auth/calendar"]
    );
    await auth.authorize();
    const calendar = google.calendar({ version: "v3", auth });

    // ── CALENDAR IDS ───────────────────────────────────────────────────
    const url = new URL(req.url);
    const env = url.searchParams.get("env") || "prod";
    const balanceCalId = env === "dev"
      ? Deno.env.get("DEV_BALANCE_CALENDAR_ID")
      : Deno.env.get("PROD_BALANCE_CALENDAR_ID");
    const billsCalId = env === "dev"
      ? Deno.env.get("DEV_BILLS_CALENDAR_ID")
      : Deno.env.get("PROD_BILLS_CALENDAR_ID");
    if (!balanceCalId || !billsCalId) throw new Error("Missing calendar IDs");

    // ── FETCH PROJECTIONS ──────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: projections, error } = await supabase
      .from("projections")
      .select("*")
      .order("proj_date", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);

    // ── INSERT EVENTS ──────────────────────────────────────────────────
    const validProjections = projections.filter(p => p.proj_date && p.projected_balance !== null);
    for (const proj of validProjections) {
      if (!proj.proj_date) continue;
      await calendar.events.insert({
        calendarId: balanceCalId,
        requestBody: {
          summary: `Projected Balance: $${Math.round(proj.projected_balance)}`,
          start: { date: proj.proj_date },
          end: { date: proj.proj_date },
        },
      });
      if (proj.bills && proj.bills.length > 0) {
        for (const bill of proj.bills) {
          try {
            await calendar.events.insert({
              calendarId: billsCalId,
              requestBody: {
                summary: `${bill.name} ${formatCurrency(bill.amount)}`,
                description: `Amount: ${formatCurrency(bill.amount)}`,
                start: { date: proj.proj_date },
                end: { date: proj.proj_date },
              },
            });
          } catch (e) {
            console.error("Error inserting bill event:", e);
          }
        }
      }
    }
    return new Response("Calendar sync complete", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("Calendar sync error:", e);
    return new Response("Calendar sync error: " + (e?.message || e), { status: 500, headers: corsHeaders });
  }
});

// ── HOLIDAY HELPERS ────────────────────────────────────────────────────────
export async function fetchUSHolidays(start: Date, end: Date): Promise<Set<string>> {
  const holidays = new Set<string>();
  for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);
    if (res.ok) {
      const data = await res.json();
      data.forEach((h: { date: string }) => holidays.add(h.date));
    }
  }
  return holidays;
}

// ── DATE HELPERS ───────────────────────────────────────────────────────────
export function adjustTransactionDate(date: Date, isPaycheck: boolean, holidays: Set<string>): Date {
  let d = new Date(date);
  const dateStr = (d: Date) => format(d, "yyyy-MM-dd");
  if (isPaycheck) {
    while (d.getDay() === 0 || d.getDay() === 6 || holidays.has(dateStr(d))) {
      d.setDate(d.getDate() - 1);
    }
  } else {
    while (d.getDay() === 0 || d.getDay() === 6 || holidays.has(dateStr(d))) {
      d.setDate(d.getDate() + 1);
    }
  }
  return d;
}

// ── BILL HELPERS ───────────────────────────────────────────────────────────
function billOccursOnDate(bill: any, currentDate: Date, holidays: Set<string>): boolean {
  const frequency = (bill.frequency || "").toLowerCase();
  const repeatsEvery = bill.repeats_every || 1;
  const startDate = bill.start_date ? parseISO(bill.start_date) : null;
  const endDate = bill.end_date ? parseISO(bill.end_date) : null;
  const isPaycheck = (bill.category || "").toLowerCase() === "paycheck";

  if (!startDate) return false;
  if (currentDate < startDate) return false;
  if (endDate && currentDate > endDate) return false;

  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (frequency === "one-time" || frequency === "one time") {
    return sameDay(startDate, currentDate);
  }

  if (frequency === "days" || frequency === "daily") {
    const daysDiff = Math.floor((currentDate.getTime() - startDate.getTime()) / 86400000);
    return daysDiff >= 0 && daysDiff % repeatsEvery === 0;
  }

  if (frequency === "weeks" || frequency === "weekly") {
    const daysDiff = Math.floor((currentDate.getTime() - startDate.getTime()) / 86400000);
    const weeksDiff = Math.floor(daysDiff / 7);
    return weeksDiff >= 0 && weeksDiff % repeatsEvery === 0 && currentDate.getDay() === startDate.getDay();
  }

  if (frequency === "months" || frequency === "monthly") {
    const monthsDiff = (currentDate.getFullYear() - startDate.getFullYear()) * 12 + (currentDate.getMonth() - startDate.getMonth());
    if (monthsDiff < 0 || monthsDiff % repeatsEvery !== 0) return false;
    const isLast = isLastDayOfMonth(startDate);
    if (isLast) {
      return isLastDayOfMonth(currentDate);
    }
    return currentDate.getDate() === startDate.getDate();
  }

  if (frequency === "years" || frequency === "yearly") {
    const yearsDiff = currentDate.getFullYear() - startDate.getFullYear();
    return yearsDiff >= 0 && yearsDiff % repeatsEvery === 0 &&
      currentDate.getMonth() === startDate.getMonth() &&
      currentDate.getDate() === startDate.getDate();
  }

  return false;
}

function isLastDayOfMonth(date: Date): boolean {
  const test = new Date(date);
  test.setDate(test.getDate() + 1);
  return test.getDate() === 1;
}

function formatCurrency(amount: number) {
  const abs = Math.abs(amount).toLocaleString();
  if (amount < 0) return `-$${abs}`;
  return `$${abs}`;
}
