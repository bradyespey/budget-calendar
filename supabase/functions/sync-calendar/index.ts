//supabase/functions/sync-calendar/index.ts

import { serve } from "https://deno.land/std@0.220.1/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { google } from "npm:googleapis"
import { addDays, format, parseISO, isValid } from "https://esm.sh/date-fns@3.4.0"

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
    const { data: settings } = await supabase.from('settings').select('projection_days').limit(1).maybeSingle();
    const projectionDays = settings?.projection_days || 30;
    const today = new Date();
    const endDate = addDays(today, projectionDays);
    const { data: projections, error } = await supabase
      .from('projections')
      .select('*')
      .gte('proj_date', format(today, 'yyyy-MM-dd'))
      .lte('proj_date', format(endDate, 'yyyy-MM-dd'));
    if (error) throw new Error(error.message);

    // ── FETCH CALENDAR EVENTS FOR BOTH CALENDARS ───────────────────────
    async function fetchAllEvents(calendarId) {
      let events = [];
      let pageToken = undefined;
      do {
        const res = await calendar.events.list({
          calendarId,
          timeMin: today.toISOString(),
          timeMax: endDate.toISOString(),
          singleEvents: true,
          maxResults: 2500,
          pageToken,
        });
        events = events.concat(res.data.items || []);
        pageToken = res.data.nextPageToken;
      } while (pageToken);
      return events;
    }
    const balanceEvents = await fetchAllEvents(balanceCalId);
    const billsEvents = await fetchAllEvents(billsCalId);

    console.log('RAW BALANCE EVENTS:', JSON.stringify(balanceEvents));
    console.log('RAW BILLS EVENTS:', JSON.stringify(billsEvents));

    // ── BUILD MAPS FOR QUICK LOOKUP ─────────────────────────────────────
    // For balances: key = date + summary
    const balanceProjMap = new Map();
    for (const proj of projections) {
      if (proj.proj_date && proj.projected_balance !== null) {
        const dateKey = format(parseISO(proj.proj_date), 'yyyy-MM-dd');
        const summary = `Projected Balance: $${Math.round(proj.projected_balance)}`;
        const key = `${dateKey.trim()}|${summary.trim()}`.normalize();
        balanceProjMap.set(key, proj);
        console.log('BALANCE PROJ KEY:', key);
      }
    }
    // Group all events by key
    const balanceEventGroups = {};
    for (const event of balanceEvents) {
      let date = event.start?.date;
      if (!date && event.start?.dateTime) {
        date = format(new Date(event.start.dateTime), 'yyyy-MM-dd');
      }
      if (date && isValid(new Date(date))) {
        const dateKey = format(new Date(date), 'yyyy-MM-dd');
        const summary = event.summary;
        const key = `${dateKey.trim()}|${summary.trim()}`.normalize();
        if (!balanceEventGroups[key]) balanceEventGroups[key] = [];
        balanceEventGroups[key].push(event);
      }
    }
    // For each group, keep only one event, delete the rest
    for (const [key, events] of Object.entries(balanceEventGroups)) {
      if (events.length > 1) {
        // Keep the first, delete the rest
        for (let i = 1; i < events.length; i++) {
          await calendar.events.delete({
            calendarId: balanceCalId,
            eventId: events[i].id,
          });
        }
      }
    }
    // Rebuild the event map after deleting duplicates
    const balanceEventMap = new Map();
    for (const [key, events] of Object.entries(balanceEventGroups)) {
      if (events.length > 0) {
        balanceEventMap.set(key, events[0]);
      }
    }
    // Insert or update as needed
    for (const [key, proj] of balanceProjMap.entries()) {
      if (!balanceEventMap.has(key)) {
        try {
          await calendar.events.insert({
            calendarId: balanceCalId,
            requestBody: {
              summary: `Projected Balance: $${Math.round(proj.projected_balance)}`,
              start: { date: proj.proj_date },
              end: { date: proj.proj_date },
            },
          });
        } catch (e) {
          console.error('Error inserting event:', key, e);
        }
      }
    }

    // For bills: key = date + summary
    const billsProjMap = new Map();
    for (const proj of projections) {
      if (proj.proj_date && proj.bills && proj.bills.length > 0) {
        const dateKey = format(parseISO(proj.proj_date), 'yyyy-MM-dd');
        for (const bill of proj.bills) {
          const summary = `${bill.name} ${formatCurrency(bill.amount)}`;
          const key = `${dateKey.trim()}|${summary.trim()}`.normalize();
          billsProjMap.set(key, { proj, bill });
          console.log('BILL PROJ KEY:', key);
        }
      }
    }
    const billsEventMap = new Map();
    for (const event of billsEvents) {
      let date = event.start?.date;
      if (!date && event.start?.dateTime) {
        date = format(new Date(event.start.dateTime), 'yyyy-MM-dd');
      }
      if (date && isValid(new Date(date))) {
        const dateKey = format(new Date(date), 'yyyy-MM-dd');
        const summary = event.summary;
        const key = `${dateKey.trim()}|${summary.trim()}`.normalize();
        billsEventMap.set(key, event);
        console.log('BILL EVENT KEY:', key);
      }
    }

    console.log('ALL BALANCE PROJ KEYS:', Array.from(balanceProjMap.keys()));
    console.log('ALL BALANCE EVENT KEYS:', Array.from(balanceEventMap.keys()));
    console.log('ALL BILL PROJ KEYS:', Array.from(billsProjMap.keys()));
    console.log('ALL BILL EVENT KEYS:', Array.from(billsEventMap.keys()));

    // ── SYNC BILLS EVENTS ───────────────────────────────────────────────
    for (const [key, { proj, bill }] of billsProjMap.entries()) {
      if (!billsEventMap.has(key)) {
        // Insert new bill event
        await calendar.events.insert({
          calendarId: billsCalId,
          requestBody: {
            summary: `${bill.name} ${formatCurrency(bill.amount)}`,
            description: `Amount: ${formatCurrency(bill.amount)}`,
            start: { date: proj.proj_date },
            end: { date: proj.proj_date },
          },
        });
      } else {
        // Optionally, update if details differ (not implemented here for brevity)
      }
    }
    // Delete bill events not in projections
    for (const [key, event] of billsEventMap.entries()) {
      if (!billsProjMap.has(key)) {
        console.log('DELETING BILL EVENT:', key);
        await calendar.events.delete({
          calendarId: billsCalId,
          eventId: event.id,
        });
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

function buildMapFromProjections(projections: any[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const proj of projections) {
    if (proj.proj_date) {
      map.set(proj.proj_date.toISOString());
    }
  }
  return map;
}

function buildMapFromCalendar(events: any[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const event of events.items) {
    if (event.start.dateTime || event.start.date) {
      map.set((event.start.dateTime || event.start.date).toISOString());
    }
  }
  return map;
}
