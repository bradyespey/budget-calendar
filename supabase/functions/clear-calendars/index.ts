//supabase/functions/clear-calendars/index.ts

import { serve } from "https://deno.land/std@0.220.1/http/server.ts";
import { google } from "npm:googleapis";

// ── CORS HEADERS ────────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── CALENDAR ID HELPERS ─────────────────────────────────────────────────────
function getCalendarIds(env: string) {
  const balanceCalId = env === "dev"
    ? Deno.env.get("DEV_BALANCE_CALENDAR_ID")
    : Deno.env.get("PROD_BALANCE_CALENDAR_ID");
  const billsCalId = env === "dev"
    ? Deno.env.get("DEV_BILLS_CALENDAR_ID")
    : Deno.env.get("PROD_BILLS_CALENDAR_ID");
  return { balanceCalId, billsCalId };
}

// ── RFC3339 DATE HELPERS ─────────────────────────────────────────────────---
function toRFC3339LocalMidnight(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const tzOffset = -date.getTimezoneOffset();
  const sign = tzOffset >= 0 ? '+' : '-';
  const hh = pad(Math.floor(Math.abs(tzOffset) / 60));
  const min = pad(Math.abs(tzOffset) % 60);
  return `${yyyy}-${mm}-${dd}T00:00:00${sign}${hh}:${min}`;
}

// ── MAIN ENTRYPOINT ─────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    // ── PARSE ENV & PARAMS ───────────────────────────────────────────────
    const url = new URL(req.url);
    const env = url.searchParams.get("env") || "prod";
    const projectionDays = Number(url.searchParams.get("days")) || 30;

    // ── GOOGLE AUTH ─────────────────────────────────────────────────-----
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) throw new Error("Missing Google service account secret");
    const key = JSON.parse(serviceAccountJson);
    const auth = new google.auth.JWT(
      key.client_email,
      undefined,
      key.private_key,
      ["https://www.googleapis.com/auth/calendar"]
    );
    await auth.authorize();
    const calendar = google.calendar({ version: "v3", auth });

    // ── GET CALENDAR IDS ─────────────────────────────────────────────---
    const { balanceCalId, billsCalId } = getCalendarIds(env);
    if (!balanceCalId || !billsCalId) throw new Error("Missing calendar IDs");

    // ── DATE RANGE ─────────────────────────────────────────────────-----
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + projectionDays);
    const timeMin = toRFC3339LocalMidnight(today);
    const timeMax = toRFC3339LocalMidnight(endDate);

    // ── CLEAR EVENTS ─────────────────────────────────────────────────---
    async function clearEvents(calendarId: string) {
      let pageToken: string | undefined = undefined;
      do {
        const res = await calendar.events.list({
          calendarId,
          timeMin,
          timeMax,
          singleEvents: true,
          maxResults: 2500,
          pageToken,
        });
        const events = res.data.items || [];
        for (const event of events) {
          await calendar.events.delete({ calendarId, eventId: event.id });
        }
        pageToken = res.data.nextPageToken || undefined;
      } while (pageToken);
    }
    await clearEvents(balanceCalId);
    await clearEvents(billsCalId);
    return new Response(
      JSON.stringify({ success: true, message: `Cleared events in ${env} calendars.` }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (e: any) {
    console.error("Clear calendars error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e.message || String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
