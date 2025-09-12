//old/nightly-projection/index.ts

import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import { format, addDays, parseISO } from "npm:date-fns@3.4.0";

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
}

// Define constants
const PROJECTION_DAYS = 100;

// Cors headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    // Check if this is a scheduled invocation
    const isScheduled = req.headers.get("Authorization") === `Bearer ${Deno.env.get("CRON_SECRET")}`;
    
    // If manual request (not scheduled), verify it's from an authenticated user
    if (!isScheduled) {
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
      
      const token = authHeader.split(" ")[1];
      
      // Verify the JWT
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
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
    }

    // Attempt to refresh Monarch Money accounts (in a real implementation)
    await refreshMonarchAccounts();
    
    // Compute the projections
    await computeProjections();
    
    // Sync with Google Calendar
    await syncGoogleCalendar();
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Nightly projection completed successfully",
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
    console.error("Error in nightly projection:", error);
    
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

// Function to simulate refreshing Monarch accounts
async function refreshMonarchAccounts() {
  console.log("Refreshing Monarch Money accounts...");
  
  // In a real implementation, this would use the Monarch Money API
  // For now, we'll simulate this with a delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Update the last_synced timestamp for all accounts
  const { error } = await supabase
    .from('accounts')
    .update({ last_synced: new Date().toISOString() });
  
  if (error) {
    console.error("Error updating account sync time:", error);
    throw new Error("Failed to update account sync time");
  }
  
  console.log("Monarch accounts refreshed successfully");
}

// Function to compute projections
async function computeProjections() {
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
  
  // 3. Compute projections for the next PROJECTION_DAYS days
  const projections: Projection[] = [];
  let runningBalance = totalBalance;
  const today = new Date();
  
  for (let i = 0; i < PROJECTION_DAYS; i++) {
    const currentDate = addDays(today, i);
    const dateStr = format(currentDate, "yyyy-MM-dd");
    
    // Apply any bills that occur on this date
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
      }
    });
    
    // Add projection for this date
    projections.push({
      proj_date: dateStr,
      projected_balance: runningBalance,
      lowest: false,
      highest: false
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
  
  // 5. Delete existing projections and insert new ones
  const { error: deleteError } = await supabase
    .from('projections')
    .delete()
    .gte('proj_date', format(today, "yyyy-MM-dd"));
  
  if (deleteError) {
    console.error("Error deleting existing projections:", deleteError);
    throw new Error("Failed to delete existing projections");
  }
  
  // 6. Insert new projections in batches to avoid request size limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < projections.length; i += BATCH_SIZE) {
    const batch = projections.slice(i, i + BATCH_SIZE);
    const { error: insertError } = await supabase
      .from('projections')
      .insert(batch);
    
    if (insertError) {
      console.error("Error inserting projections:", insertError);
      throw new Error("Failed to insert projections");
    }
  }
  
  console.log(`Successfully computed ${projections.length} days of projections`);
}

// Function to sync with Google Calendar
async function syncGoogleCalendar() {
  console.log("Syncing with Google Calendar...");
  
  // In a real implementation, this would use the Google Calendar API
  // For now, we'll simulate this with a delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log("Google Calendar sync completed");
  
  // Check for low balance alerts
  await checkLowBalanceAlerts();
}

// Function to check for low balance alerts
async function checkLowBalanceAlerts() {
  console.log("Checking for low balance alerts...");
  
  const LOW_BALANCE_THRESHOLD = 500; // Configure as needed
  
  // Get projections
  const { data: projections, error } = await supabase
    .from('projections')
    .select('*')
    .lt('projected_balance', LOW_BALANCE_THRESHOLD)
    .order('proj_date', { ascending: true })
    .limit(1);
  
  if (error) {
    console.error("Error checking for low balance:", error);
    return;
  }
  
  if (projections.length > 0) {
    const lowBalance = projections[0];
    console.log(`Low balance alert: ${lowBalance.projected_balance} on ${lowBalance.proj_date}`);
    
    // In a real implementation, send an email alert here
    // For now, we'll just log it
  }
}