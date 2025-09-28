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

    logger.info("Starting run all workflow - triggering all functions asynchronously");
    
    // Trigger all functions asynchronously without waiting for completion
    // This avoids the 60-second timeout limit of Firebase Functions v1
    
    const functions = [
      'refreshAccounts',
      'refreshTransactions', 
      'updateBalance',
      'budgetProjection',
      'syncCalendar'
    ];
    
    const triggerPromises = functions.map(async (functionName) => {
      try {
        const url = `https://us-central1-budgetcalendar-e6538.cloudfunctions.net/${functionName}`;
        const body = functionName === 'syncCalendar' ? JSON.stringify({ env: 'prod' }) : JSON.stringify({});
        
        // Fire and forget - don't wait for completion
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body
        }).catch(error => {
          logger.error(`Failed to trigger ${functionName}:`, error);
        });
        
        logger.info(`🚀 Triggered ${functionName}`);
        return { function: functionName, triggered: true };
      } catch (error) {
        logger.error(`Failed to trigger ${functionName}:`, error);
        return { function: functionName, triggered: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });
    
    // Wait for all trigger attempts to complete (should be very fast)
    const triggerResults = await Promise.all(triggerPromises);
    
    const successfulTriggers = triggerResults.filter(r => r.triggered).length;
    const totalFunctions = functions.length;
    
    logger.info(`Successfully triggered ${successfulTriggers}/${totalFunctions} functions`);
    
    res.status(200).json({
      success: true,
      message: `Budget workflow triggered: ${successfulTriggers}/${totalFunctions} functions started`,
      triggeredFunctions: successfulTriggers,
      totalFunctions,
      results: triggerResults,
      timestamp: new Date().toISOString(),
      note: "Functions are running asynchronously. Check individual function logs for completion status."
    });
  }
);
