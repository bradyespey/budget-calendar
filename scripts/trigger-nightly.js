#!/usr/bin/env node

/**
 * Trigger nightly budget update workflow using Firebase SDK
 * This properly calls Firebase callable functions instead of raw HTTP
 */

const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Firebase config (same as frontend)
const firebaseConfig = {
  apiKey: "AIzaSyA8PBORjASZYT51SzcFng6itsQRaOYGo7I",
  authDomain: "budgetcalendar-e6538.firebaseapp.com",
  projectId: "budgetcalendar-e6538",
  storageBucket: "budgetcalendar-e6538.firebasestorage.app",
  messagingSenderId: "342823251353",
  appId: "1:342823251353:web:6a1e2bd82a1926b5897708"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

async function triggerNightlyUpdate() {
  console.log('🌙 Starting nightly budget update workflow...');
  
  try {
    // Step 1: Refresh accounts (external API)
    console.log('⏳ Step 1: Refreshing accounts...');
    try {
      const refreshAccountsFunction = httpsCallable(functions, 'refreshAccounts');
      await refreshAccountsFunction({ debugMode: false });
      console.log('✅ Account refresh completed');
    } catch (error) {
      console.log('⚠️ Account refresh failed:', error.message);
      // Continue with other steps
    }
    
    // Wait 60 seconds for account refresh to propagate
    console.log('⏳ Waiting 60 seconds for account refresh...');
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    // Step 2: Update balance
    console.log('⏳ Step 2: Updating balance...');
    try {
      const chaseBalanceFunction = httpsCallable(functions, 'chaseBalance');
      const balanceResult = await chaseBalanceFunction();
      console.log('✅ Balance updated:', balanceResult.data);
    } catch (error) {
      console.log('⚠️ Balance update failed:', error.message);
      // Continue with other steps
    }
    
    // Step 3: Run projections
    console.log('⏳ Step 3: Running projections...');
    try {
      const budgetProjectionFunction = httpsCallable(functions, 'budgetProjection');
      const projectionResult = await budgetProjectionFunction();
      console.log('✅ Projections completed:', projectionResult.data);
    } catch (error) {
      console.log('❌ Projections failed:', error.message);
      throw error; // This must succeed
    }
    
    // Step 4: Sync calendar
    console.log('⏳ Step 4: Syncing calendar...');
    try {
      const syncCalendarFunction = httpsCallable(functions, 'syncCalendar');
      const calendarResult = await syncCalendarFunction({ calendarMode: 'both' });
      console.log('✅ Calendar sync completed:', calendarResult.data);
    } catch (error) {
      console.log('❌ Calendar sync failed:', error.message);
      throw error; // This must succeed
    }
    
    // Step 5: Send success alert
    console.log('⏳ Step 5: Sending success alert...');
    try {
      const sendAlertFunction = httpsCallable(functions, 'sendAlert');
      await sendAlertFunction({
        to: 'baespey@gmail.com',
        subject: 'Budget Calendar: Nightly Update Completed',
        text: `Nightly budget update workflow completed successfully at ${new Date().toISOString()}`
      });
      console.log('✅ Success alert sent');
    } catch (error) {
      console.log('⚠️ Failed to send alert:', error.message);
      // Don't fail the whole workflow for this
    }
    
    console.log('🎉 Nightly budget update workflow completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Nightly workflow failed:', error.message);
    
    // Send error alert
    try {
      const sendAlertFunction = httpsCallable(functions, 'sendAlert');
      await sendAlertFunction({
        to: 'baespey@gmail.com',
        subject: 'Budget Calendar: Nightly Update Failed',
        text: `Nightly budget update workflow failed: ${error.message}\n\nTime: ${new Date().toISOString()}`
      });
      console.log('📧 Error alert sent');
    } catch (alertError) {
      console.log('⚠️ Failed to send error alert:', alertError.message);
    }
    
    process.exit(1);
  }
}

// Run the workflow
triggerNightly();
