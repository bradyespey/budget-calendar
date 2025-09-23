import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const region = 'us-central1';

export const runAll = functions.region(region).https.onRequest(
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    logger.info("Starting run all workflow");
    
    const results = {
      refreshAccounts: { success: false, error: null as string | null },
      refreshTransactions: { success: false, error: null as string | null },
      updateBalance: { success: false, error: null as string | null },
      budgetProjection: { success: false, error: null as string | null },
      syncCalendar: { success: false, error: null as string | null }
    };
    
    // Step 1: Refresh accounts (must be first)
    try {
      const refreshResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/refreshAccounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      if (!refreshResponse.ok) {
        throw new Error(`HTTP ${refreshResponse.status}`);
      }
      
      results.refreshAccounts.success = true;
      logger.info("✅ Account refresh completed");
      
    } catch (error) {
      results.refreshAccounts.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error("❌ Account refresh failed:", error);
    }
    
    // Steps 2-3: Run transactions and balance in parallel (they don't depend on each other)
    const [transactionsResult, balanceResult] = await Promise.allSettled([
      // Refresh transactions
      Promise.race([
        fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/refreshTransactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 30 seconds')), 30000))
      ]).then(async (response: any) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        results.refreshTransactions.success = true;
        logger.info("✅ Transactions refresh completed");
      }),
      
      // Update balance
      Promise.race([
        fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/updateBalance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 30 seconds')), 30000))
      ]).then(async (response: any) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        results.updateBalance.success = true;
        logger.info("✅ Balance update completed");
      })
    ]);
    
    // Handle transactions result
    if (transactionsResult.status === 'rejected') {
      results.refreshTransactions.error = transactionsResult.reason instanceof Error ? transactionsResult.reason.message : 'Unknown error';
      logger.error("❌ Transactions refresh failed:", transactionsResult.reason);
    }
    
    // Handle balance result
    if (balanceResult.status === 'rejected') {
      results.updateBalance.error = balanceResult.reason instanceof Error ? balanceResult.reason.message : 'Unknown error';
      logger.error("❌ Balance update failed:", balanceResult.reason);
    }
    
    // Steps 4-5: Run budget projection and calendar sync in parallel (they don't depend on each other)
    const [projectionResult, calendarResult] = await Promise.allSettled([
      // Budget projection
      Promise.race([
        fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/budgetProjection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 30 seconds')), 30000))
      ]).then(async (response: any) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        results.budgetProjection.success = true;
        logger.info("✅ Budget projection completed");
      }),
      
      // Sync calendar
      Promise.race([
        fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/syncCalendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ env: 'prod' })
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 8 minutes')), 480000))
      ]).then(async (response: any) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        results.syncCalendar.success = true;
        logger.info("✅ Calendar sync completed");
      })
    ]);
    
    // Handle projection result
    if (projectionResult.status === 'rejected') {
      results.budgetProjection.error = projectionResult.reason instanceof Error ? projectionResult.reason.message : 'Unknown error';
      logger.error("❌ Budget projection failed:", projectionResult.reason);
    }
    
    // Handle calendar result
    if (calendarResult.status === 'rejected') {
      results.syncCalendar.error = calendarResult.reason instanceof Error ? calendarResult.reason.message : 'Unknown error';
      logger.error("❌ Calendar sync failed:", calendarResult.reason);
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
