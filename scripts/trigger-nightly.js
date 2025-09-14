#!/usr/bin/env node

/**
 * Trigger nightly budget update workflow using direct HTTP calls
 * This bypasses authentication issues by calling functions directly
 */

async function triggerRunAll() {
  console.log('🚀 Starting run all workflow...');
  
  try {
    // Call the runAllHttp function directly via HTTPS
    // This function orchestrates the entire workflow internally without authentication
    const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/runAllHttp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {}
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Run all completed successfully:', result);
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Run all failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Run the workflow
triggerRunAll();
