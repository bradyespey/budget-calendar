import { serve } from "https://deno.land/std@0.220.1/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { google } from "npm:googleapis"
import { format } from "https://esm.sh/date-fns@3.4.0"

// ── CORS HEADERS ─────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── DELAY HELPER ─────────────────────────────
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// ── RETRY HELPER ─────────────────────────────
async function withRetry(fn, maxRetries = 3, delayMs = 250) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); }
    catch (err) { lastErr = err; await delay(delayMs); }
  }
  throw lastErr;
}

// ── MAIN ENTRYPOINT ──────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // ── GOOGLE AUTH ─────────────────────────
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) throw new Error("Missing Google service account secret");
    let key;
    try { key = JSON.parse(serviceAccountJson); }
    catch (e) { console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:", e); throw e; }
    const auth = new google.auth.JWT(
      key.client_email, undefined, key.private_key, ["https://www.googleapis.com/auth/calendar"]
    );
    await auth.authorize();
    const calendar = google.calendar({ version: "v3", auth });

    // ── CALENDAR IDS ────────────────────────
    const url = new URL(req.url);
    const env = url.searchParams.get("env") || "prod";
    const balanceCalId = env === "dev"
      ? Deno.env.get("DEV_BALANCE_CALENDAR_ID")
      : Deno.env.get("PROD_BALANCE_CALENDAR_ID");
    const billsCalId = env === "dev"
      ? Deno.env.get("DEV_BILLS_CALENDAR_ID")
      : Deno.env.get("PROD_BILLS_CALENDAR_ID");
    if (!balanceCalId || !billsCalId) throw new Error("Missing calendar IDs");

    // ── FETCH PROJECTIONS ───────────────────
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
    if (!projections.length) return new Response("No projections", { status: 204, headers: corsHeaders });

    // ── EVENT WINDOW (tight) ────────────────
    const startDate = new Date(projections[0].proj_date);
    const endDate = new Date(projections[projections.length - 1].proj_date);
    const maxDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);

    // ── FETCH EVENTS (ALL) ──────────────────
    async function fetchAllEvents(calendarId) {
      let events = [], pageToken = undefined;
      do {
        const res = await calendar.events.list({
          calendarId,
          timeMin: startDate.toISOString(),
          timeMax: maxDate.toISOString(),
          singleEvents: true,
          maxResults: 100,
          pageToken,
        });
        events = events.concat(res.data.items || []);
        pageToken = res.data.nextPageToken;
      } while (pageToken);
      return events;
    }
    const [balanceEvents, billsEvents] = await Promise.all([
      fetchAllEvents(balanceCalId),
      fetchAllEvents(billsCalId)
    ]);

    // ── SERIAL DELETE ───────────────────────
    async function deleteEvents(calendarId, events) {
      for (let i = 0; i < events.length; i += 10) {
        await Promise.all(
          events.slice(i, i + 10).map(ev =>
            withRetry(() => calendar.events.delete({ calendarId, eventId: ev.id }))
              .catch(e => console.error("Delete event failed:", e))
          )
        );
        await delay(200);
      }
    }
    await deleteEvents(balanceCalId, balanceEvents);
    await deleteEvents(billsCalId, billsEvents);

    // ── INSERT EVENTS SERIAL ─────────────────
    function formatCurrency(amount: number) {
      const abs = Math.abs(amount).toLocaleString();
      return amount < 0 ? `-$${abs}` : `$${abs}`;
    }
    const balanceInserts = projections.map(proj => ({
      calendarId: balanceCalId,
      requestBody: {
        summary: `Projected Balance: $${Math.round(proj.projected_balance)}`,
        start: { date: proj.proj_date },
        end: { date: proj.proj_date }
      }
    }));
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
              end: { date: proj.proj_date }
            }
          });
        }
      }
    }
    async function insertEvents(inserts) {
      for (let i = 0; i < inserts.length; i += 10) {
        await Promise.all(
          inserts.slice(i, i + 10).map(event =>
            withRetry(() => calendar.events.insert(event))
              .catch(e => console.error("Insert event failed:", e))
          )
        );
        await delay(250);
      }
    }
    await insertEvents(balanceInserts);
    await insertEvents(billInserts);

    return new Response("Calendar sync complete", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("Calendar sync error:", e);
    return new Response("Calendar sync error: " + (e?.message || e), { status: 500, headers: corsHeaders });
  }
});
