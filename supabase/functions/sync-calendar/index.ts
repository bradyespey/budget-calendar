//supabase/functions/sync-calendar/index.ts

import { serve } from "https://deno.land/std@0.220.1/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { google } from "npm:googleapis"
import { format } from "https://esm.sh/date-fns@3.4.0"

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
    const today = new Date();
    const { data: projections, error } = await supabase
      .from('projections')
      .select('*')
      .gte('proj_date', format(today, 'yyyy-MM-dd'))
      .order('proj_date', { ascending: true });
    if (error) throw new Error(error.message);

    // Get the last projection date to use as end date for calendar sync
    const endDate = projections.length > 0 
      ? new Date(projections[projections.length - 1].proj_date)
      : today;

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

    // Fetch events in parallel for better performance
    const [balanceEvents, billsEvents] = await Promise.all([
      fetchAllEvents(balanceCalId),
      fetchAllEvents(billsCalId)
    ]);

    // ── BUILD BALANCE MAPS ──────────────────────────────────────────────
    const balanceProjMap = new Map();
    for (const proj of projections) {
      if (proj.proj_date && proj.projected_balance !== null) {
        const dateKey = format(new Date(proj.proj_date), 'yyyy-MM-dd');
        const summary = `Projected Balance: $${Math.round(proj.projected_balance)}`;
        const key = `${dateKey.trim()}|${summary.trim()}`.normalize();
        balanceProjMap.set(key, proj);
      }
    }

    // Group existing balance events by date and summary
    const balanceEventGroups = new Map();
    for (const event of balanceEvents) {
      let date = event.start?.date;
      if (!date && event.start?.dateTime) {
        date = format(new Date(event.start.dateTime), 'yyyy-MM-dd');
      }
      if (date && isValid(new Date(date))) {
        const dateKey = format(new Date(date), 'yyyy-MM-dd');
        const summary = event.summary;
        const key = `${dateKey.trim()}|${summary.trim()}`.normalize();
        if (!balanceEventGroups.has(key)) {
          balanceEventGroups.set(key, []);
        }
        balanceEventGroups.get(key).push(event);
      }
    }

    // Delete duplicate balance events
    for (const [key, events] of balanceEventGroups.entries()) {
      if (events.length > 1) {
        // Keep the first event, delete the rest
        for (let i = 1; i < events.length; i++) {
          await calendar.events.delete({
            calendarId: balanceCalId,
            eventId: events[i].id,
          });
        }
      }
    }

    // Create or update balance events
    const balanceEventMap = new Map();
    for (const [key, events] of balanceEventGroups.entries()) {
      if (events.length > 0) {
        balanceEventMap.set(key, events[0]);
      }
    }

    // Batch create missing balance events
    const balanceEventsToCreate = [];
    for (const [key, proj] of balanceProjMap.entries()) {
      if (!balanceEventMap.has(key)) {
        balanceEventsToCreate.push({
          calendarId: balanceCalId,
          requestBody: {
            summary: `Projected Balance: $${Math.round(proj.projected_balance)}`,
            start: { date: proj.proj_date },
            end: { date: proj.proj_date },
          },
        });
      }
    }

    // Create balance events in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < balanceEventsToCreate.length; i += BATCH_SIZE) {
      const batch = balanceEventsToCreate.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(event => 
        calendar.events.insert(event).catch(e => 
          console.error('Error inserting balance event:', e)
        )
      ));
    }

    // ── BUILD BILLS MAPS ──────────────────────────────────────────────
    const billsProjMap = new Map();
    for (const proj of projections) {
      if (proj.proj_date && proj.bills && proj.bills.length > 0) {
        const dateKey = format(new Date(proj.proj_date), 'yyyy-MM-dd');
        for (const bill of proj.bills) {
          const summary = `${bill.name} ${formatCurrency(bill.amount)}`;
          const key = `${dateKey.trim()}|${summary.trim()}`.normalize();
          billsProjMap.set(key, { proj, bill });
        }
      }
    }

    // Group existing bill events by date and summary
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
      }
    }

    // Batch create missing bill events
    const billsEventsToCreate = [];
    for (const [key, { proj, bill }] of billsProjMap.entries()) {
      if (!billsEventMap.has(key)) {
        billsEventsToCreate.push({
          calendarId: billsCalId,
          requestBody: {
            summary: `${bill.name} ${formatCurrency(bill.amount)}`,
            description: `Amount: ${formatCurrency(bill.amount)}`,
            start: { date: proj.proj_date },
            end: { date: proj.proj_date },
          },
        });
      }
    }

    // Create bill events in batches
    for (let i = 0; i < billsEventsToCreate.length; i += BATCH_SIZE) {
      const batch = billsEventsToCreate.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(event => 
        calendar.events.insert(event).catch(e => 
          console.error('Error inserting bill event:', e)
        )
      ));
    }

    // Delete bill events that no longer exist in projections
    const billsEventsToDelete = [];
    for (const [key, event] of billsEventMap.entries()) {
      if (!billsProjMap.has(key)) {
        billsEventsToDelete.push({
          calendarId: billsCalId,
          eventId: event.id,
        });
      }
    }

    // Delete bill events in batches
    for (let i = 0; i < billsEventsToDelete.length; i += BATCH_SIZE) {
      const batch = billsEventsToDelete.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(event => 
        calendar.events.delete(event).catch(e => 
          console.error('Error deleting bill event:', e)
        )
      ));
    }

    return new Response("Calendar sync complete", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("Calendar sync error:", e);
    return new Response("Calendar sync error: " + (e?.message || e), { status: 500, headers: corsHeaders });
  }
});

// ── BILL HELPERS ───────────────────────────────────────────────────────────
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
