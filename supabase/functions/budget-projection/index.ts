//supabase/functions/budget-projection/index.ts

import { format, addDays, isWeekend } from "npm:date-fns@3.4.0";
import { formatInTimeZone, zonedTimeToUtc } from "npm:date-fns-tz@3.0.0-beta.3";

// Imports: Supabase client
import { createClient } from "npm:@supabase/supabase-js@2.39.8";

// Constants
// Cors headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Credentials": "true",
};

// Supabase client setup
// Create Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Define timezone at the top level since it's used in multiple functions
const TIMEZONE = 'America/Chicago';

// Main HTTP handler
// Main function to handle the request
Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }
  
  try {
    // Get JWT from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { 
          status: 401, 
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders 
          } 
        }
      );
    }
    // No need to decode the token unless you want to check claims

    // Fetch settings from DB
    const { data: settings, error } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error || !settings) {
      throw new Error('Failed to fetch settings');
    }

    const userSettings: Settings = {
      projectionDays: settings.projection_days || 7,
      balanceThreshold: settings.balance_threshold || 1000,
      manual_balance_override: settings.manual_balance_override || null,
    };
    
    // Compute the projections
    await computeProjections(userSettings);
    
    // Check for low balance alerts
    await checkLowBalanceAlerts(userSettings.balanceThreshold);
    
    // After projections are inserted, add:
    await supabase
      .from('settings')
      .update({ last_projected_at: new Date().toISOString() })
      .eq('id', 1);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Budget projection completed successfully",
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        } 
      }
    );
  } catch (error) {
    console.error("Error in budget projection:", error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || "Unknown error occurred" 
      }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        } 
      }
    );
  }
});

// Helper functions
// Helper function to fetch US holidays
async function fetchUSHolidays(start: Date, end: Date): Promise<Set<string>> {
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

// Helper function to adjust transaction date based on weekends and holidays
function adjustTransactionDate(date: Date, isPaycheck: boolean, holidays: Set<string>): Date {
  const d = new Date(date);
  const dateStr = (d: Date) => formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
  
  if (isPaycheck) {
    // For paychecks, move backwards to Friday
    while (isWeekend(d) || holidays.has(dateStr(d))) {
      d.setDate(d.getDate() - 1);
    }
  } else {
    // For bills, move forwards to Monday
    while (isWeekend(d) || holidays.has(dateStr(d))) {
      d.setDate(d.getDate() + 1);
    }
  }
  return d;
}

function formatCurrency(amount: number) {
  return (amount < 0 ? "-$" : "$") + Math.abs(amount).toLocaleString();
}

// Helper functions
function formatNumberWithCommas(num: number) {
  if (num === null || num === undefined || num === "") return "";
  return num.toLocaleString("en-US");
}

// Projection logic
// Function to compute projections
async function computeProjections(settings: Settings) {
  const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
  const startDate = zonedTimeToUtc(`${today}T00:00:00`, TIMEZONE);
  const projectionDates: string[] = [];
  // Start from tomorrow for projections
  for (let i = 1; i < settings.projectionDays; i++) {
    projectionDates.push(formatInTimeZone(addDays(startDate, i), TIMEZONE, "yyyy-MM-dd"));
  }
  // Last projection date for weekly calculation
  const lastDate = addDays(startDate, settings.projectionDays);

  const [{ data: accounts }, { data: bills }, holidays] = await Promise.all([
    supabase.from('accounts').select('*'),
    supabase.from('bills').select('*'),
    fetchUSHolidays(startDate, addDays(startDate, settings.projectionDays + 7)), // +7 for possible adjustments
  ]);
  if (!accounts || !bills) throw new Error('Failed to fetch accounts or bills');

  await supabase.from('projections').delete().gte('proj_date', today);

  // Use manual balance override if set, otherwise use account balance
  const totalBalance = settings.manual_balance_override !== null && settings.manual_balance_override !== undefined
    ? settings.manual_balance_override
    : accounts.reduce((sum, a) => sum + a.last_balance, 0);
  let runningBalance = totalBalance;
  const projections: Projection[] = [];

  // First, add today's balance and transactions
  const todayBills: Bill[] = [];
  for (const bill of bills) {
    const billStart = zonedTimeToUtc(`${bill.start_date}T00:00:00`, TIMEZONE);
    const billEnd = bill.end_date ? zonedTimeToUtc(`${bill.end_date}T00:00:00`, TIMEZONE) : null;
    const isPaycheck = bill.category.toLowerCase() === 'paycheck';
    
    // Skip dates before start for non-paychecks
    if (!isPaycheck && today < formatInTimeZone(billStart, TIMEZONE, "yyyy-MM-dd")) continue;
    if (billEnd && today > formatInTimeZone(billEnd, TIMEZONE, "yyyy-MM-dd")) continue;

    let intendedDate: Date | null = null;
    let occurs = false;

    // --- Frequency logic ---
    if (bill.frequency === 'one-time') {
      intendedDate = billStart;
    } else if (bill.frequency === 'daily') {
      const daysDiff = Math.floor((startDate.getTime() - billStart.getTime()) / 86400000);
      if (daysDiff % bill.repeats_every === 0 && daysDiff >= 0) intendedDate = startDate;
    } else if (bill.frequency === 'weekly') {
      const isPaycheck = bill.category.toLowerCase() === 'paycheck';
      const intervalDays = 7 * bill.repeats_every;
      let occDate = new Date(billStart);
      while (occDate <= lastDate) {
        const adjusted = adjustTransactionDate(new Date(occDate), isPaycheck, holidays);
        if (formatInTimeZone(adjusted, TIMEZONE, "yyyy-MM-dd") === today) {
          intendedDate = occDate;
          break;
        }
        occDate.setDate(occDate.getDate() + intervalDays);
      }
    } else if (bill.frequency === 'monthly') {
      // Compute the intended day-of-month (clamp if month too short)
      const BASE = startDate;
      const origDay = new Date(bill.start_date + 'T00:00:00').getDate();
      const year = BASE.getFullYear();
      const month = BASE.getMonth();
      const lastDay = new Date(year, month + 1, 0).getDate();
      const day = Math.min(origDay, lastDay);
      // Only occurs if this projection day matches the bill day
      if (BASE.getDate() === day) {
        intendedDate = BASE;
      }
    }

    if (intendedDate) {
      // Do not re-adjust monthly items—they already land on the correct day
      const skipAdjust = bill.frequency === 'daily' || bill.frequency === 'monthly';
      let adjustedDate = new Date(intendedDate);
      if (!skipAdjust) {
        const isPaycheck = bill.category.toLowerCase() === 'paycheck';
        const dateStrFn = (d: Date) => formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
        if (isWeekend(adjustedDate) || holidays.has(dateStrFn(adjustedDate))) {
          if (isPaycheck) {
            while (isWeekend(adjustedDate) || holidays.has(dateStrFn(adjustedDate))) {
              adjustedDate.setDate(adjustedDate.getDate() - 1);
            }
          } else {
            while (isWeekend(adjustedDate) || holidays.has(dateStrFn(adjustedDate))) {
              adjustedDate.setDate(adjustedDate.getDate() + 1);
            }
          }
        }
      }
      const dateStrFn = (d: Date) => formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
      if (dateStrFn(adjustedDate) === today) {
        occurs = true;
      }
    }

    if (occurs) {
      todayBills.push(bill);
    }
  }

  // Add today's entry with current balance and today's bills
  projections.push({
    proj_date: today,
    projected_balance: totalBalance,
    lowest: false,
    highest: false,
    bills: todayBills,
  });

  // Now process future dates
  for (const dateStr of projectionDates) {
    const currentDate = zonedTimeToUtc(`${dateStr}T00:00:00`, TIMEZONE);
    const billsForDay: Bill[] = [];

    for (const bill of bills) {
      const billStart = zonedTimeToUtc(`${bill.start_date}T00:00:00`, TIMEZONE);
      const billEnd = bill.end_date ? zonedTimeToUtc(`${bill.end_date}T00:00:00`, TIMEZONE) : null;
      const isPaycheck = bill.category.toLowerCase() === 'paycheck';
      // Skip dates before start for non-paychecks
      if (!isPaycheck && dateStr < formatInTimeZone(billStart, TIMEZONE, "yyyy-MM-dd")) continue;
      if (billEnd && dateStr > formatInTimeZone(billEnd, TIMEZONE, "yyyy-MM-dd")) continue;

      let intendedDate: Date | null = null;
      let occurs = false;

      // --- Frequency logic ---
      if (bill.frequency === 'one-time') {
        intendedDate = billStart;
      } else if (bill.frequency === 'daily') {
        const daysDiff = Math.floor((currentDate.getTime() - billStart.getTime()) / 86400000);
        if (daysDiff % bill.repeats_every === 0 && daysDiff >= 0) intendedDate = currentDate;
      } else if (bill.frequency === 'weekly') {
        const isPaycheck = bill.category.toLowerCase() === 'paycheck';
        const intervalDays = 7 * bill.repeats_every;
        let occDate = new Date(billStart);
        while (occDate <= lastDate) {
          // Adjust for weekends/holidays
          const adjusted = adjustTransactionDate(new Date(occDate), isPaycheck, holidays);
          if (formatInTimeZone(adjusted, TIMEZONE, "yyyy-MM-dd") === dateStr) {
            intendedDate = occDate;
            break;
          }
          occDate.setDate(occDate.getDate() + intervalDays);
        }
      } else if (bill.frequency === 'monthly') {
        // Compute the intended day-of-month (clamp if month too short)
        const BASE = currentDate;
        const origDay = new Date(bill.start_date + 'T00:00:00').getDate();
        const year = BASE.getFullYear();
        const month = BASE.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const day = Math.min(origDay, lastDay);
        // Only occurs if this projection day matches the bill day
        if (BASE.getDate() === day) {
          intendedDate = BASE;
        }
      }

      if (intendedDate) {
        // Do not re-adjust monthly items—they already land on the correct day
        const skipAdjust = bill.frequency === 'daily' || bill.frequency === 'monthly';
        // Weekend/holiday adjustment (skip for daily/monthly)
        let adjustedDate = new Date(intendedDate);
        if (!skipAdjust) {
          const isPaycheck = bill.category.toLowerCase() === 'paycheck';
          const dateStrFn = (d: Date) => formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
          if (isWeekend(adjustedDate) || holidays.has(dateStrFn(adjustedDate))) {
            if (isPaycheck) {
              while (isWeekend(adjustedDate) || holidays.has(dateStrFn(adjustedDate))) {
                adjustedDate.setDate(adjustedDate.getDate() - 1);
              }
            } else {
              while (isWeekend(adjustedDate) || holidays.has(dateStrFn(adjustedDate))) {
                adjustedDate.setDate(adjustedDate.getDate() + 1);
              }
            }
          }
        }
        const dateStrFn = (d: Date) => formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
        // Only add if the *adjusted* date matches the current projection day
        if (dateStrFn(adjustedDate) === dateStr) {
          occurs = true;
        }
      }

      if (occurs) {
        billsForDay.push(bill);
        runningBalance += bill.amount;
      }
    }

    projections.push({
      proj_date: dateStr,
      projected_balance: Math.round(runningBalance * 100) / 100,
      lowest: false,
      highest: false,
      bills: billsForDay,
    });
  }

  // Mark highest/lowest (excluding today)
  if (projections.length > 1) {
    let highest = projections[1], lowest = projections[1];
    projections.slice(1).forEach(p => {
      if (p.projected_balance > highest.projected_balance) highest = p;
      if (p.projected_balance < lowest.projected_balance) lowest = p;
    });
    projections.forEach(p => {
      p.highest = p.proj_date === highest.proj_date;
      p.lowest = p.proj_date === lowest.proj_date;
    });
  }

  // Insert in batches
  const BATCH_SIZE = 50;
  for (let i = 0; i < projections.length; i += BATCH_SIZE) {
    await supabase.from('projections').insert(projections.slice(i, i + BATCH_SIZE));
  }
}

// Low balance alerts
// Function to check for low balance alerts
async function checkLowBalanceAlerts(threshold: number) {
  console.log("Checking for low balance alerts...");
  
  // Get projections
  const { data: projections, error } = await supabase
    .from('projections')
    .select('*')
    .lt('projected_balance', threshold)
    .order('proj_date', { ascending: true })
    .limit(1);
  
  if (error) {
    console.error("Error checking for low balance:", error);
    return;
  }
  
  if (projections.length > 0) {
    const lowBalance = projections[0];
    console.log(`Low balance alert: ${Math.round(lowBalance.projected_balance).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} on ${lowBalance.proj_date}`);
    
    // In a real implementation, send an email alert here
    // For now, we'll just log it
  }
}

// Type definitions
interface Bill {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time';
  repeats_every: number;
  start_date: string;
  end_date?: string;
  owner?: string;
  note?: string;
}

interface Account {
  id: string;
  display_name: string;
  last_balance: number;
  last_synced: string;
}

interface Projection {
  proj_date: string;
  projected_balance: number;
  lowest: boolean;
  highest: boolean;
  bills?: Bill[];
}

interface Settings {
  projectionDays: number;
  balanceThreshold: number;
  manual_balance_override?: number | null;
}