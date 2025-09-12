// Simple projection test
import { addDays } from "npm:date-fns@3.4.0";
import { formatInTimeZone, zonedTimeToUtc } from "npm:date-fns-tz@3.0.0-beta.3";
import { createClient } from "npm:@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Credentials": "true",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);
const TIMEZONE = 'America/Chicago';

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    console.log("=== SIMPLE PROJECTION TEST ===");
    
    const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
    console.log("Today:", today);
    
    // Create simple projections for next 5 days
    const projections = [];
    let balance = 21369; // Starting balance
    
    for (let i = 1; i <= 5; i++) {
      const date = formatInTimeZone(addDays(new Date(), i), TIMEZONE, "yyyy-MM-dd");
      balance -= Math.random() * 500; // Random decrease
      
      projections.push({
        proj_date: date,
        projected_balance: Math.round(balance * 100) / 100,
        highest: false,
        lowest: false,
        bills: []
      });
    }
    
    // Mark highest and lowest
    if (projections.length > 0) {
      let highest = projections[0];
      let lowest = projections[0];
      
      projections.forEach(p => {
        if (p.projected_balance > highest.projected_balance) highest = p;
        if (p.projected_balance < lowest.projected_balance) lowest = p;
      });
      
      highest.highest = true;
      lowest.lowest = true;
    }
    
    console.log("Created projections:", projections.length);
    
    // Clear old projections
    console.log("Clearing old projections...");
    await supabase.from('projections').delete().gte('proj_date', today);
    
    // Clear old flags
    console.log("Clearing old flags...");
    await supabase.from('projections').update({ highest: false, lowest: false }).or('highest.eq.true,lowest.eq.true');
    
    // Insert new projections
    console.log("Inserting new projections...");
    const { data, error } = await supabase
      .from('projections')
      .insert(projections)
      .select();
    
    if (error) {
      throw new Error("Insert failed: " + error.message);
    }
    
    console.log("Insert successful, inserted:", data?.length);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Created ${projections.length} projections`,
        projections: data
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});