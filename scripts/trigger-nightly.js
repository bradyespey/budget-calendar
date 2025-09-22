#!/usr/bin/env node

/**
 * Trigger nightly budget update workflow using direct HTTP calls
 * This bypasses authentication issues by calling functions directly
 */

async function triggerRunAll() {
  console.log('🚀 Starting run all workflow...');
  
  try {
    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8 * 60 * 1000); // 8 minute timeout
    
    // Call the runAll function directly via HTTPS
    const response = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/runAll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Run all completed successfully:', result);
    process.exit(0);
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('💥 Run all timed out after 8 minutes');
    } else {
      console.error('💥 Run all failed:', error.message);
      console.error('Full error:', error);
    }
    process.exit(1);
  }
}

// Run the workflow
triggerRunAll();
