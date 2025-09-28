import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const region = 'us-central1';

export const runAll = functions
  .region(region)
  .runWith({
    timeoutSeconds: 540, // 9 minutes max timeout
    memory: '1GB' // Increased memory for large datasets
  })
  .https.onRequest(
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    logger.info("Starting run all workflow - sequential execution with timeout handling");
    
    const results = {
      refreshAccounts: { success: false, error: null as string | null },
      updateBalance: { success: false, error: null as string | null },
      refreshTransactions: { success: false, error: null as string | null },
      budgetProjection: { success: false, error: null as string | null },
      syncCalendar: { success: false, error: null as string | null }
    };
    
    // Step 1: Refresh accounts (must be first - takes ~1 minute)
    try {
      logger.info("🔄 Step 1: Refreshing accounts...");
      const refreshResponse = await Promise.race([
        fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/refreshAccounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 3 minutes')), 180000))
      ]) as Response;
      
      if (!refreshResponse.ok) {
        throw new Error(`HTTP ${refreshResponse.status}`);
      }
      
      results.refreshAccounts.success = true;
      logger.info("✅ Account refresh completed");
      
    } catch (error) {
      results.refreshAccounts.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error("❌ Account refresh failed:", error);
      // Continue with other steps even if this fails
    }
    
    // Step 2: Update balance (depends on refreshed accounts)
    try {
      logger.info("💰 Step 2: Updating balance...");
      const balanceResponse = await Promise.race([
        fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/updateBalance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 2 minutes')), 120000))
      ]) as Response;
      
      if (!balanceResponse.ok) {
        throw new Error(`HTTP ${balanceResponse.status}`);
      }
      
      results.updateBalance.success = true;
      logger.info("✅ Balance update completed");
      
    } catch (error) {
      results.updateBalance.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error("❌ Balance update failed:", error);
    }
    
    // Step 3: Refresh transactions (depends on refreshed accounts)
    try {
      logger.info("📊 Step 3: Refreshing transactions...");
      const transactionsResponse = await Promise.race([
        fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/refreshTransactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 2 minutes')), 120000))
      ]) as Response;
      
      if (!transactionsResponse.ok) {
        throw new Error(`HTTP ${transactionsResponse.status}`);
      }
      
      results.refreshTransactions.success = true;
      logger.info("✅ Transactions refresh completed");
      
    } catch (error) {
      results.refreshTransactions.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error("❌ Transactions refresh failed:", error);
    }
    
    // Step 4: Budget projection (depends on balance and transactions)
    try {
      logger.info("📈 Step 4: Running budget projection...");
      const projectionResponse = await Promise.race([
        fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/budgetProjection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 2 minutes')), 120000))
      ]) as Response;
      
      if (!projectionResponse.ok) {
        throw new Error(`HTTP ${projectionResponse.status}`);
      }
      
      results.budgetProjection.success = true;
      logger.info("✅ Budget projection completed");
      
    } catch (error) {
      results.budgetProjection.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error("❌ Budget projection failed:", error);
    }
    
    // Step 5: Sync calendar (depends on budget projection)
    try {
      logger.info("📅 Step 5: Syncing calendar...");
      const calendarResponse = await Promise.race([
        fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/syncCalendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ env: 'prod' })
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 5 minutes')), 300000))
      ]) as Response;
      
      if (!calendarResponse.ok) {
        throw new Error(`HTTP ${calendarResponse.status}`);
      }
      
      results.syncCalendar.success = true;
      logger.info("✅ Calendar sync completed");
      
    } catch (error) {
      results.syncCalendar.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error("❌ Calendar sync failed:", error);
    }
    
    // Calculate overall success
    const successCount = Object.values(results).filter(r => r.success).length;
    const totalSteps = Object.keys(results).length;
    const overallSuccess = successCount === totalSteps;
    
    const stepDetails = Object.entries(results).map(([step, result]) => ({
      step,
      success: result.success,
      error: result.error
    }));
    
    logger.info(`Run all workflow completed: ${successCount}/${totalSteps} steps successful`);
    
    res.status(overallSuccess ? 200 : 207).json({
      success: overallSuccess,
      message: `Run all workflow completed: ${successCount}/${totalSteps} steps successful`,
      successCount,
      totalSteps,
      results: stepDetails,
      timestamp: new Date().toISOString(),
    });
  }
);
