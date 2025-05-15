//supabase/functions/clear-calendars/index.ts

import { serve } from "https://deno.land/std@0.220.1/http/server.ts";
import { google } from "npm:googleapis";

// Add CORS headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Helper to get calendar IDs based on mode
function getCalendarIds(env: string) {
  const balanceCalId = env === "dev"
    ? Deno.env.get("DEV_BALANCE_CALENDAR_ID")
    : Deno.env.get("PROD_BALANCE_CALENDAR_ID");
  const billsCalId = env === "dev"
    ? Deno.env.get("DEV_BILLS_CALENDAR_ID")
    : Deno.env.get("PROD_BILLS_CALENDAR_ID");
  return { balanceCalId, billsCalId };
}

function toRFC3339Local(date: Date) {
  // Returns YYYY-MM-DDT00:00:00-05:00 (or your local offset)
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

function toRFC3339LocalMidnight(date: Date) {
  // Returns YYYY-MM-DDT00:00:00-05:00 (or your local offset)
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse env and projection_days from settings
    const url = new URL(req.url);
    const env = url.searchParams.get("env") || "prod";
    const projectionDays = Number(url.searchParams.get("days")) || 30;

    // Google Auth
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

    // Get calendar IDs
    const { balanceCalId, billsCalId } = getCalendarIds(env);
    if (!balanceCalId || !billsCalId) throw new Error("Missing calendar IDs");

    // Get local date at midnight, but as RFC3339 date-only string
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + projectionDays);

    // Use date-only string for timeMin and timeMax (Google interprets as local calendar time)
    const timeMin = toRFC3339LocalMidnight(today);
    const timeMax = toRFC3339LocalMidnight(endDate);

    // Helper to clear events in a calendar
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
        console.log("Fetched events:", events.map(e => ({
          id: e.id,
          summary: e.summary,
          start: e.start,
          end: e.end
        })));
        for (const event of events) {
          console.log(`Deleting event: ${event.id}`);
          const deleteRes = await calendar.events.delete({ calendarId, eventId: event.id });
          console.log(`Delete response for ${event.id}: ${deleteRes.status}`);
        }
        pageToken = res.data.nextPageToken || undefined;
      } while (pageToken);
    }

    await clearEvents(balanceCalId);
    await clearEvents(billsCalId);

    return new Response(
      JSON.stringify({ success: true, message: `Cleared events in ${env} calendars.` }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
    );
  } catch (e: any) {
    console.error("Clear calendars error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e.message || String(e) }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
    );
  }
});
