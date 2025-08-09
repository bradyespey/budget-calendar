// Minimal test function to check database access
import { createClient } from "npm:@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Credentials": "true",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
console.log("Service role key available:", supabaseKey ? "Yes" : "No");
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    console.log("Starting minimal test...");
    
    // Test 1: Try to read from settings
    console.log("1. Testing settings read...");
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('*');
    console.log("Settings result:", settingsError ? `Error: ${settingsError.message}` : `Success: ${settings?.length} rows`);
    
    // Test 2: Try to insert a simple projection
    console.log("2. Testing projection insert...");
    const testProjection = {
      proj_date: '2025-08-03',
      projected_balance: 12345,
      highest: false,
      lowest: false,
      bills: []
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('projections')
      .insert([testProjection])
      .select();
    
    console.log("Insert result:", insertError ? `Error: ${insertError.message}` : `Success: ${insertData?.length} rows`);
    
    // Clean up
    if (!insertError) {
      await supabase.from('projections').delete().eq('proj_date', '2025-08-03');
      console.log("Cleanup completed");
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        settingsError: settingsError?.message || null,
        insertError: insertError?.message || null,
        message: "Test completed"
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Test error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});