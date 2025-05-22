import { serve } from "https://deno.land/std@0.220.1/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { google } from "npm:googleapis"
import { format, isValid } from "https://esm.sh/date-fns@3.4.0"

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

    // Batch size for calendar sync operations
    const BATCH_SIZE = 50;

    // ── FETCH CALENDAR EVENTS FOR BOTH CALENDARS ───────────────────────
    async function fetchAllEvents(calendarId) {
      // Use projection date range for fetching all-day events
      const startDateProj = projections.length > 0
        ? new Date(projections[0].proj_date)
        : today;
      const maxDateProj = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
      let events = [];
      let pageToken = undefined;
      do {
        const res = await calendar.events.list({
          calendarId,
          timeMin: startDateProj.toISOString(),
          timeMax: maxDateProj.toISOString(),
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

    // ── SYNC BALANCE EVENTS ──────────────────────────────────────────────
    // Remove all existing balance events
    await Promise.all(
      balanceEvents.map(ev =>
        calendar.events.delete({ calendarId: balanceCalId, eventId: ev.id })
      )
    );

    // Recreate all balance events to exactly match projections
    const balanceInserts = projections.map(proj => ({
      calendarId: balanceCalId,
      requestBody: {
        summary: `Projected Balance: $${Math.round(proj.projected_balance)}`,
        start: { date: proj.proj_date },
        end: { date: proj.proj_date },
      },
    }));

    for (let i = 0; i < balanceInserts.length; i += BATCH_SIZE) {
      await Promise.all(
        balanceInserts.slice(i, i + BATCH_SIZE).map(event =>
          calendar.events.insert(event).catch(e =>
            console.error('Error inserting balance event:', e)
          )
        )
      );
    }

    // ── SYNC BILL EVENTS ──────────────────────────────────────────────
    // Remove all existing bill events
    await Promise.all(
      billsEvents.map(ev =>
        calendar.events.delete({ calendarId: billsCalId, eventId: ev.id })
      )
    );

    // Recreate all bill events to exactly match projections
    const billInserts = [];
    for (const proj of projections) {
      if (proj.proj_date && proj.bills?.length) {
        for (const bill of proj.bills) {
          billInserts.push({
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
    }
    for (let i = 0; i < billInserts.length; i += BATCH_SIZE) {
      await Promise.all(
        billInserts.slice(i, i + BATCH_SIZE).map(event =>
          calendar.events.insert(event).catch(e =>
            console.error('Error inserting bill event:', e)
          )
        )
      );
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
