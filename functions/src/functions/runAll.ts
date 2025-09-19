import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const region = 'us-central1';

export const runAll = functions.region(region).https.onRequest(
  async (req, res) => {
    try {
      logger.info("Starting run all workflow");
      
      // Step 1: Refresh accounts
      try {
        const refreshResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/refreshAccounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!refreshResponse.ok) {
          throw new Error(`Account refresh failed: ${refreshResponse.status}`);
        }
        
      } catch (error) {
        logger.error("Account refresh failed:", error);
        throw error;
      }
      
      // Step 2: Refresh transactions
      try {
        const transactionsResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/refreshTransactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!transactionsResponse.ok) {
          throw new Error(`Transactions refresh failed: ${transactionsResponse.status}`);
        }
        
      } catch (error) {
        logger.error("Transactions refresh failed:", error);
        throw error;
      }
      
      // Step 3: Update balance
      try {
        const balanceResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/updateBalance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!balanceResponse.ok) {
          throw new Error(`Balance update failed: ${balanceResponse.status}`);
        }
        
      } catch (error) {
        logger.error("Balance update failed:", error);
        throw error;
      }
      
      // Step 4: Budget projection
      try {
        const projectionResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/budgetProjection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!projectionResponse.ok) {
          throw new Error(`Projection failed: ${projectionResponse.status}`);
        }
        
      } catch (error) {
        logger.error("Projection failed:", error);
        throw error;
      }
      
      // Step 5: Sync calendar
      try {
        const calendarResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/syncCalendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ env: 'prod' })
        });
        
        if (!calendarResponse.ok) {
          throw new Error(`Calendar sync failed: ${calendarResponse.status}`);
        }
        
      } catch (error) {
        logger.error("Calendar sync failed:", error);
        throw error;
      }
      
      res.status(200).json({
        success: true,
        message: "Run all workflow completed successfully",
        steps: [
          "Account refresh",
          "Transactions refresh",
          "Balance update", 
          "Budget projection",
          "Calendar sync"
        ],
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      logger.error("Error in run all workflow:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  }
);
