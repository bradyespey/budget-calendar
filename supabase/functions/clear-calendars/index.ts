//supabase/functions/clear-calendars/index.ts

import { serve } from "https://deno.land/std@0.220.1/http/server.ts";
import { google } from "npm:googleapis";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS HEADERS ────────────────────────────────────────────────────────
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

// ── MAIN ENTRYPOINT ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    // ── FETCH SETTINGS ─────────────────────────────────────────────---
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: settings, error: settingsError } = await supabase.from('settings').select('calendar_mode').limit(1).maybeSingle();
    if (settingsError) throw new Error('Failed to fetch settings: ' + settingsError.message);
    const calendarMode = settings?.calendar_mode || 'prod';

    // ── GOOGLE AUTH ─────────────────────────────────────────────────--
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

    // ── CALENDAR IDS ─────────────────────────────────────────────---
    const balanceCalId = calendarMode === "dev"
      ? Deno.env.get("DEV_BALANCE_CALENDAR_ID")
      : Deno.env.get("PROD_BALANCE_CALENDAR_ID");
    const billsCalId = calendarMode === "dev"
      ? Deno.env.get("DEV_BILLS_CALENDAR_ID")
      : Deno.env.get("PROD_BILLS_CALENDAR_ID");
    if (!balanceCalId || !billsCalId) throw new Error("Missing calendar IDs");

    // ── CLEAR ALL EVENTS ─────────────────────────────────────────---
    async function clearAllEvents(calendarId) {
      let totalDeleted = 0;
      let deletedThisPass;
      do {
        deletedThisPass = 0;
        let pageToken = undefined;
        do {
          const res = await calendar.events.list({
            calendarId,
            singleEvents: false,
            maxResults: 2500,
            pageToken,
            showDeleted: false,
          });
          const events = res.data.items || [];
          for (const event of events) {
            try {
              await calendar.events.delete({ calendarId, eventId: event.id });
              deletedThisPass++;
            } catch (err) {
              console.error('Failed to delete event:', event.id, err);
            }
          }
          pageToken = res.data.nextPageToken;
        } while (pageToken);
        totalDeleted += deletedThisPass;
        if (deletedThisPass > 0) {
          // Wait a bit to avoid rate limits
          await new Promise(res => setTimeout(res, 500));
        }
      } while (deletedThisPass > 0);
      return totalDeleted;
    }
    const moreBalance = await clearAllEvents(balanceCalId);
    const moreBills = await clearAllEvents(billsCalId);
    const more = moreBalance || moreBills;
    return new Response(
      JSON.stringify({ success: true, more, message: more ? 'More events to delete, run again.' : `Cleared all events in ${calendarMode} calendars.` }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (e) {
    console.error("Clear calendars error:", e);
    // Send error alert
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-alert`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: Deno.env.get("ALERT_EMAIL"),
          subject: 'Budget Calendar App - Clear Calendars Error',
          text: `The Clear Calendars function failed with error: ${e.message || e}. Please review in the Budget Calendar app at https://budget.theespeys.com.`,
        })
      });
    } catch (err) { console.error('Failed to send error alert:', err); }
    return new Response(
      JSON.stringify({ success: false, error: e.message || String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
