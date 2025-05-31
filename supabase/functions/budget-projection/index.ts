//supabase/functions/budget-projection/index.ts

import { addDays, isWeekend, differenceInCalendarDays, differenceInCalendarMonths, parseISO, startOfDay, format } from "npm:date-fns@3.4.0";
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
    
    // After all projections are inserted, mark highest/lowest (excluding today)
    try {
      const { data: allProjs, error } = await supabase
        .from('projections')
        .select('proj_date, projected_balance')
        .order('proj_date', { ascending: true });
      if (!error && allProjs && allProjs.length > 1) {
        let highest = allProjs[1], lowest = allProjs[1];
        for (let i = 1; i < allProjs.length; i++) {
          if (allProjs[i].projected_balance > highest.projected_balance) highest = allProjs[i];
          if (allProjs[i].projected_balance < lowest.projected_balance) lowest = allProjs[i];
        }
        // Clear all highest/lowest first
        await supabase.from('projections').update({ highest: false, lowest: false }).gte('proj_date', allProjs[1].proj_date);
        // Set highest
        await supabase.from('projections').update({ highest: true }).eq('proj_date', highest.proj_date);
        // Set lowest
        await supabase.from('projections').update({ lowest: true }).eq('proj_date', lowest.proj_date);
      }
    } catch (err) {
      console.error('Error updating highest/lowest projections:', err);
    }
    
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
          subject: 'Budget Calendar App - Budget Projection Error',
          text: `The Budget Projection function failed with error: ${error.message || error}. Please review in [Budget Calendar](https://budget.theespeys.com/).`
        })
      });
    } catch (e) { console.error('Failed to send error alert:', e); }
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
function adjustTransactionDate(date: Date, isPaycheck: boolean, holidays: Set<string>, label: string = ""): Date {
  let d = new Date(date);
  const dateStr = (d: Date) => formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
  let original = dateStr(d);
  // Repeat until not weekend/holiday
  while (true) {
    if (isPaycheck) {
      if (isWeekend(d)) {
        d.setDate(d.getDate() - 1);
        continue;
      }
      if (holidays.has(dateStr(d))) {
        d.setDate(d.getDate() - 1);
        continue;
      }
    } else {
      if (isWeekend(d)) {
        // Move forward to Monday
        d.setDate(d.getDate() + (8 - d.getDay()) % 7);
        continue;
      }
      if (holidays.has(dateStr(d))) {
        d.setDate(d.getDate() + 1);
        continue;
      }
    }
    break;
  }
  return d;
}


// Helper function to get last day of month
function getLastDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

// Helper function to adjust monthly date
function adjustMonthlyDate(date: Date, targetDay: number): Date {
  const lastDay = getLastDayOfMonth(date);
  const adjustedDate = new Date(date);
  
  // If target day is greater than last day of month, use last day
  if (targetDay > lastDay) {
    adjustedDate.setDate(lastDay);
  } else {
    adjustedDate.setDate(targetDay);
  }
  
  return adjustedDate;
}

// Projection logic
// Function to compute projections
async function computeProjections(settings: Settings) {
  const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
  const startDate = zonedTimeToUtc(`${today}T00:00:00`, TIMEZONE);
  const projectionDates: string[] = [];
  for (let i = 1; i < settings.projectionDays; i++) {
    projectionDates.push(formatInTimeZone(addDays(startDate, i), TIMEZONE, "yyyy-MM-dd"));
  }
  const lastDate = addDays(startDate, settings.projectionDays);

  const [{ data: accounts }, { data: bills }, holidays] = await Promise.all([
    supabase.from('accounts').select('*'),
    supabase.from('bills').select('*'),
    fetchUSHolidays(startDate, addDays(startDate, settings.projectionDays + 7)),
  ]);
  if (!accounts || !Array.isArray(accounts)) throw new Error('Failed to fetch accounts');
  if (!bills || !Array.isArray(bills)) throw new Error('Failed to fetch bills');
  if (!holidays || !(holidays instanceof Set)) throw new Error('Failed to fetch holidays');

  await supabase.from('projections').delete().gte('proj_date', today);

  const totalBalance = settings.manual_balance_override !== null && settings.manual_balance_override !== undefined
    ? settings.manual_balance_override
    : accounts.reduce((sum, a) => sum + a.last_balance, 0);
  let runningBalance = totalBalance;
  const projections: Projection[] = [];

  // Declare billsByDate ONCE here
  const billsByDate: Record<string, Bill[]> = {};

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
      // compute diff between local dates
      const daysDiff = differenceInCalendarDays(
        startOfDay(new Date(today)),
        startOfDay(parseISO(bill.start_date))
      );
      if (daysDiff >= 0 && daysDiff % intervalDays === 0) {
        intendedDate = startDate;
      }
    } else if (bill.frequency === 'monthly') {
      // Handle monthly bills for today
      const targetDay = parseISO(bill.start_date).getDate();
      const lastDay = getLastDayOfMonth(startDate);
      const day = Math.min(targetDay, lastDay);
      let intended = new Date(startDate);
      intended.setDate(day);
    
      const isPaycheck = bill.category.toLowerCase() === 'paycheck';
      let adjusted = new Date(intended);
      // backward for paychecks, forward for bills
      if (isPaycheck) {
        while (isWeekend(adjusted) || holidays.has(formatInTimeZone(adjusted, TIMEZONE, "yyyy-MM-dd"))) {
          adjusted.setDate(adjusted.getDate() - 1);
        }
      } else {
        while (isWeekend(adjusted) || holidays.has(formatInTimeZone(adjusted, TIMEZONE, "yyyy-MM-dd"))) {
          adjusted.setDate(adjusted.getDate() + 1);
        }
      }
    
      if (formatInTimeZone(adjusted, TIMEZONE, "yyyy-MM-dd") === today) {
        occurs = true;
      }
    } else if (bill.frequency === 'yearly') {
      // Get the target month/day from the bill's start date
      const targetMonth = new Date(bill.start_date + 'T00:00:00').getMonth();
      const targetDay = new Date(bill.start_date + 'T00:00:00').getDate();
      // Clamp to last day of month for the current projection year/month
      const clampedDay = Math.min(targetDay, getLastDayOfMonth(new Date()));
      if (
        new Date().getMonth() === targetMonth &&
        new Date().getDate() === clampedDay
      ) {
        intendedDate = adjustMonthlyDate(new Date(), targetDay);
      }
    }

    if (intendedDate) {
      const skipAdjust = bill.frequency === 'daily';
      let adjustedDate = new Date(intendedDate);
      if (!skipAdjust) {
        const isPaycheck = bill.category.toLowerCase() === 'paycheck';
        adjustedDate = adjustTransactionDate(adjustedDate, isPaycheck, holidays, bill.name);
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

  // Cap the number of projections per run
  const MAX_PROJECTIONS = 1000;
  let projectionCount = 0;

  try {
    // Now process future dates
    // --- NEW LOGIC: For each bill, generate all intended dates in the window, adjust, and add to correct day ---
    // Build a map of dateStr -> bills for that day
    for (const bill of bills) {
      const billStart = zonedTimeToUtc(`${bill.start_date}T00:00:00`, TIMEZONE);
      const billEnd = bill.end_date ? zonedTimeToUtc(`${bill.end_date}T00:00:00`, TIMEZONE) : null;
      const isPaycheck = bill.category.toLowerCase() === 'paycheck';

      if (bill.frequency === 'monthly') {
        // For each month in the projection window, generate the intended date
        let monthCursor = new Date(billStart); // Start from bill's start date
        // Always start at the first of the month for each iteration
        monthCursor.setDate(1);

        while (monthCursor <= addDays(startDate, settings.projectionDays)) {
          // Skip today since it's handled in the "today" logic above
          if (formatInTimeZone(monthCursor, TIMEZONE, "yyyy-MM-dd") === today) {
            monthCursor.setMonth(monthCursor.getMonth() + bill.repeats_every);
            continue;
          }

          const targetDay = parseISO(bill.start_date).getDate();
          const lastDay = getLastDayOfMonth(monthCursor);
          let intended = new Date(monthCursor);
          intended.setDate(targetDay > lastDay ? lastDay : targetDay);

          // Adjust for business day (back for paychecks, forward for others)
          if (isPaycheck) {
            while (isWeekend(intended) || holidays.has(formatInTimeZone(intended, TIMEZONE, "yyyy-MM-dd"))) {
              intended.setDate(intended.getDate() - 1);
            }
          } else {
            while (isWeekend(intended) || holidays.has(formatInTimeZone(intended, TIMEZONE, "yyyy-MM-dd"))) {
              intended.setDate(intended.getDate() + 1);
            }
          }

          const intendedStr = formatInTimeZone(intended, TIMEZONE, "yyyy-MM-dd");
          if (projectionDates.includes(intendedStr) && intended >= startDate && (!billEnd || intended <= billEnd)) {
            if (!billsByDate[intendedStr]) billsByDate[intendedStr] = [];
            billsByDate[intendedStr].push(bill);
          }

          // Move to next month based on repeats_every
          monthCursor.setMonth(monthCursor.getMonth() + bill.repeats_every);
        }
        continue; // Skip the rest of the loop for monthly bills
      }

      // Handle non-monthly bills
      let current = new Date(billStart);
      while (current <= addDays(startDate, settings.projectionDays)) {
        // Skip if before projection window
        if (current < startDate) {
          // Increment to next occurrence
          if (bill.frequency === 'daily') current = addDays(current, bill.repeats_every);
          else if (bill.frequency === 'weekly') current = addDays(current, 7 * bill.repeats_every);
          else if (bill.frequency === 'monthly') {
            current.setMonth(current.getMonth() + bill.repeats_every);
          } else if (bill.frequency === 'yearly') {
            current.setFullYear(current.getFullYear() + bill.repeats_every);
          } else break;
          continue;
        }
        // Stop if after end date
        if (billEnd && current > billEnd) break;
        
        let intended = new Date(current);
        if (bill.frequency === 'monthly') {
          const targetDay = new Date(bill.start_date + 'T00:00:00').getDate();
          const lastDay = getLastDayOfMonth(current);
          // If the bill's target day is greater than this month's last day, use the last day
          if (targetDay > lastDay) {
            intended.setDate(lastDay);
          } else {
            intended.setDate(targetDay);
          }
          // Now adjust for business day if needed (for all monthly bills)
          while (isWeekend(intended) || holidays.has(formatInTimeZone(intended, TIMEZONE, "yyyy-MM-dd"))) {
            intended.setDate(intended.getDate() - 1);
          }
        } else if (bill.frequency === 'yearly') {
          const targetMonth = new Date(bill.start_date + 'T00:00:00').getMonth();
          const targetDay = new Date(bill.start_date + 'T00:00:00').getDate();
          if (intended.getMonth() !== targetMonth) {
            // Increment to next year
            current.setFullYear(current.getFullYear() + bill.repeats_every);
            continue;
          }
          intended.setDate(Math.min(targetDay, getLastDayOfMonth(intended)));
        }
        // Adjust for holidays/weekends (skip for daily)
        let adjusted = new Date(intended);
        if (bill.frequency !== 'daily' && bill.frequency !== 'monthly') {
          adjusted = adjustTransactionDate(adjusted, isPaycheck, holidays, bill.name);
        }
        const adjustedStr = formatInTimeZone(adjusted, TIMEZONE, "yyyy-MM-dd");
        // Only add if in projection window
        if (projectionDates.includes(adjustedStr)) {
          if (!billsByDate[adjustedStr]) billsByDate[adjustedStr] = [];
          billsByDate[adjustedStr].push(bill);
        }
        // Increment to next occurrence
        if (bill.frequency === 'daily') current = addDays(current, bill.repeats_every);
        else if (bill.frequency === 'weekly') current = addDays(current, 7 * bill.repeats_every);
        else if (bill.frequency === 'monthly') current.setMonth(current.getMonth() + bill.repeats_every);
        else if (bill.frequency === 'yearly') current.setFullYear(current.getFullYear() + bill.repeats_every);
        else break;
      }
    }
    // Now, for each projection date, add the bills for that day
    for (let idx = 0; idx < projectionDates.length; idx++) {
      if (projectionCount >= MAX_PROJECTIONS) {
        break;
      }
      const dateStr = projectionDates[idx];
      const billsForDay: Bill[] = billsByDate[dateStr] || [];
      for (const bill of billsForDay) {
        runningBalance += bill.amount;
      }
      // Insert this day's projection immediately
      const projectionObj = {
        proj_date: dateStr,
        projected_balance: Math.round(runningBalance * 100) / 100,
        lowest: false,
        highest: false,
        bills: billsForDay,
      };
      try {
        await supabase.from('projections').insert([projectionObj]);
        await new Promise(res => setTimeout(res, 5)); // 5ms delay to avoid rate limits
      } catch (err) {
        console.error('Error inserting projection for date:', dateStr, err);
        throw err;
      }
      projectionCount++;
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
    const BATCH_SIZE = 10;
    for (let i = 0; i < projections.length; i += BATCH_SIZE) {
      const batch = projections.slice(i, i + BATCH_SIZE);
      try {
        await supabase.from('projections').insert(batch);
        await new Promise(res => setTimeout(res, 100)); // 100ms delay
      } catch (err) {
        console.error('Error inserting projections batch:', err, {
          batchIndex: i / BATCH_SIZE + 1,
          batchSize: batch.length,
          batch,
          totalProjections: projections.length
        });
        throw err;
      }
    }
  } catch (err) {
    console.error('Error in projection loop:', err);
    throw err;
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
    const formattedBalance = Math.round(lowBalance.projected_balance).toLocaleString('en-US', { 
      style: 'currency', 
      currency: 'USD', 
      maximumFractionDigits: 0 
    });
    // Format date as 'Friday, June 9, 2025'
    const formattedDate = format(new Date(lowBalance.proj_date), 'EEEE, MMMM d, yyyy');
    const thresholdFormatted = `$${Math.round(threshold).toLocaleString('en-US')}`;
    const appUrl = 'https://budget.theespeys.com/';
    
    console.log(`Low balance alert: ${formattedBalance} on ${lowBalance.proj_date}`);
    
    // Send email alert
    try {
      const alertRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-alert`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: Deno.env.get("ALERT_EMAIL"),
            subject: 'Budget Calendar App - Low Balance',
            text: `Your projected balance will drop to ${formattedBalance} on ${formattedDate}. This is below your configured threshold of ${thresholdFormatted}. Visit the Budget Calendar app at https://budget.theespeys.com to review.`,
          })
        }
      );
      
      if (!alertRes.ok) {
        throw new Error('Failed to send alert email');
      }
    } catch (err) {
      console.error('Error sending low balance alert:', err);
    }
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