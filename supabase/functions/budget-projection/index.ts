//supabase/functions/budget-projection/index.ts

import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import { format, addDays, parseISO } from "npm:date-fns@3.4.0";
import { decode } from "https://deno.land/x/djwt@v2.8/mod.ts";

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
}

// Cors headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Credentials": "true",
};

// Create Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

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

// Function to compute projections
async function computeProjections(settings: Settings) {
  console.log("Computing balance projections...");
  
  // 1. Get the current total balance from accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('*');
  
  if (accountsError) {
    console.error("Error fetching accounts:", accountsError);
    throw new Error("Failed to fetch accounts");
  }
  
  const totalBalance = accounts.reduce((sum: number, account: Account) => {
    return sum + account.last_balance;
  }, 0);
  
  // 2. Get all bills
  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select('*');
  
  if (billsError) {
    console.error("Error fetching bills:", billsError);
    throw new Error("Failed to fetch bills");
  }
  
  // 3. Compute projections for the specified number of days
  const projections: Projection[] = [];
  let runningBalance = totalBalance;
  const today = new Date();
  
  for (let i = 0; i < settings.projectionDays; i++) {
    const currentDate = addDays(today, i);
    const dateStr = format(currentDate, "yyyy-MM-dd");
    
    // Collect bills for this day
    const billsForDay: Bill[] = [];

    bills.forEach((bill: Bill) => {
      const startDate = parseISO(bill.start_date);
      const endDate = bill.end_date ? parseISO(bill.end_date) : null;
      
      // Skip if bill hasn't started yet or has ended
      if (currentDate < startDate || (endDate && currentDate > endDate)) {
        return;
      }
      
      // Determine if the bill occurs on this date based on frequency
      let occurs = false;
      
      if (format(currentDate, "yyyy-MM-dd") === format(startDate, "yyyy-MM-dd")) {
        // Bill always occurs on its start date
        occurs = true;
      } else if (bill.frequency === 'daily') {
        const daysSinceStart = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        occurs = daysSinceStart % bill.repeats_every === 0;
      } else if (bill.frequency === 'weekly') {
        const daysSinceStart = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        occurs = daysSinceStart % (7 * bill.repeats_every) === 0;
      } else if (bill.frequency === 'monthly') {
        occurs = currentDate.getDate() === startDate.getDate() && 
                (currentDate.getMonth() - startDate.getMonth() + 
                (currentDate.getFullYear() - startDate.getFullYear()) * 12) % bill.repeats_every === 0;
      } else if (bill.frequency === 'yearly') {
        occurs = currentDate.getDate() === startDate.getDate() && 
                currentDate.getMonth() === startDate.getMonth() && 
                (currentDate.getFullYear() - startDate.getFullYear()) % bill.repeats_every === 0;
      }
      
      if (occurs) {
        runningBalance += bill.amount;
        // Add a simplified bill object for the day
        billsForDay.push({
          id: bill.id,
          name: bill.name,
          amount: bill.amount,
          category: bill.category,
          frequency: bill.frequency,
          repeats_every: bill.repeats_every,
          start_date: bill.start_date,
          end_date: bill.end_date,
          owner: bill.owner,
          note: bill.note,
        });
      }
    });
    
    // Add projection for this date, including the bills array
    projections.push({
      proj_date: dateStr,
      projected_balance: runningBalance,
      lowest: false,
      highest: false,
      bills: billsForDay,
    });
  }
  
  // 4. Identify highest and lowest points
  if (projections.length > 0) {
    let highest = projections[0];
    let lowest = projections[0];
    
    projections.forEach(proj => {
      if (proj.projected_balance > highest.projected_balance) {
        highest = proj;
      }
      if (proj.projected_balance < lowest.projected_balance) {
        lowest = proj;
      }
    });
    
    // Set the highest and lowest flags
    projections.forEach(proj => {
      if (proj.proj_date === highest.proj_date) {
        proj.highest = true;
      }
      if (proj.proj_date === lowest.proj_date) {
        proj.lowest = true;
      }
    });
  }
  
  // 5. Delete old projections for today and future
  const { error: deleteError } = await supabase
    .from('projections')
    .delete()
    .gte('proj_date', format(today, "yyyy-MM-dd"));

  if (deleteError) {
    console.error("Delete error details:", deleteError);
    throw new Error("Failed to delete existing projections: " + deleteError.message);
  }
  
  // 6. Insert new projections in batches to avoid request size limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < projections.length; i += BATCH_SIZE) {
    const batch = projections.slice(i, i + BATCH_SIZE);
    console.log("First 3 projections:", JSON.stringify(batch.slice(0, 3), null, 2));
    const { error: insertError } = await supabase
      .from('projections')
      .insert(batch);
    
    if (insertError) {
      console.error("Error inserting projections:", insertError);
      throw new Error("Failed to insert projections: " + insertError.message);
    }
  }
  
  console.log(`Successfully computed ${settings.projectionDays} days of projections`);
}

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

function formatCurrency(amount: number) {
  return (amount < 0 ? "-$" : "$") + Math.abs(amount).toLocaleString();
}

// Helper functions
function formatNumberWithCommas(num) {
  if (num === null || num === undefined || num === "") return "";
  return num.toLocaleString("en-US");
}