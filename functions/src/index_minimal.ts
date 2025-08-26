/**
 * Budget Calendar Firebase Cloud Functions
 * Minimal working version with only essential functions
 */

import { https } from "firebase-functions/v1";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions";

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

/**
 * 📊 Budget Projection Function
 * Replaces: supabase/functions/budget-projection
 */
export const budgetProjection = https.onCall(
  async (data, context) => {
    try {
      logger.info("Starting budget projection calculation");

      // Get settings from Firestore
      const settingsSnapshot = await db.collection('settings').limit(1).get();
      
      if (settingsSnapshot.empty) {
        // Create default settings
        logger.info("No settings found, creating default settings...");
        const defaultSettings = {
          projectionDays: 30,
          balanceThreshold: 1000,
          manualBalanceOverride: null,
          lastProjectedAt: null
        };
        
        await db.collection('settings').add(defaultSettings);
      }

      // For now, just return a simple response to test the function
      logger.info("Budget projection test completed");
      
      return { 
        success: true, 
        message: "Budget projection test completed successfully",
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error("Error in budget projection:", error);
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  });

/**
 * 💰 Refresh Accounts Function
 * Replaces: supabase/functions/refresh-accounts
 * Uses Monarch Money API to refresh all linked accounts
 */
export const refreshAccounts = https.onCall(
  async (data, context) => {
    try {
      logger.info("Starting account refresh via Flask API");

      // Get Flask API config from Firebase config
      const config = functions.config();
      const apiAuthValue = config.api?.auth;
      const apiRefreshUrl = "https://api.theespeys.com/refresh_accounts";
      
      if (!apiAuthValue) {
        throw new https.HttpsError('failed-precondition', 'Missing api.auth in Firebase config');
      }

      // Call Flask API endpoint for account refresh
      try {
        const flaskResponse = await fetch(apiRefreshUrl, {
          method: "GET",
          headers: {
            "Authorization": "Basic " + Buffer.from(apiAuthValue).toString('base64'),
            "User-Agent": "Mozilla/5.0 (compatible; Budget-Calendar/1.0)",
          },
        });

        if (!flaskResponse.ok) {
          logger.error(`Flask refresh failed: ${flaskResponse.status}`);
          throw new https.HttpsError('internal', `Flask refresh failed: ${flaskResponse.status}`);
        }

        logger.info("Account refresh triggered successfully via Flask API");
      } catch (error) {
        logger.error("Error calling Flask API:", error);
        if (error instanceof https.HttpsError) {
          throw error;
        }
        throw new https.HttpsError('internal', `Flask API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      return { 
        success: true,
        message: "Account refresh triggered successfully",
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      logger.error("Error refreshing accounts:", error);
      if (error instanceof https.HttpsError) {
        throw error;
      }
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  });

/**
 * 💰 Chase Balance Function
 * Replaces: supabase/functions/chase-balance
 * Updates the Chase checking account balance from Monarch Money
 */
export const chaseBalance = https.onCall(
  async (data, context) => {
    try {
      logger.info("Starting Chase balance update via Monarch GraphQL API");
      const config = functions.config();
      const monarchToken = config.monarch?.token;
      const monarchCheckingId = config.monarch?.checking_id;
      
      if (!monarchToken) {
        throw new https.HttpsError('failed-precondition', 'Missing monarch.token in Firebase config');
      }
      if (!monarchCheckingId) {
        throw new https.HttpsError('failed-precondition', 'Missing monarch.checking_id in Firebase config');
      }

      const response = await fetch("https://api.monarchmoney.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${monarchToken}`,
        },
        body: JSON.stringify({
          operationName: "Web_GetAccountsPage",
          query: `
            query Web_GetAccountsPage {
              accountTypeSummaries {
                accounts { id displayName displayBalance }
              }
            }
          `,
        }),
      });

      if (!response.ok) {
        throw new https.HttpsError('internal', `Monarch GraphQL error ${response.status}`);
      }

      const result = await response.json();
      const { accountTypeSummaries } = result.data;
      
      const checking = (accountTypeSummaries as any[])
        .flatMap(s => s.accounts)
        .find((a: any) => String(a.id) === String(monarchCheckingId));
        
      if (!checking) {
        throw new https.HttpsError('not-found', 'Chase Checking account ID not found in Monarch');
      }

      const currentBalance = checking.displayBalance;
      
      const accountRef = db.collection('accounts').doc('checking');
      await accountRef.update({
        displayName: "Chase Checking",
        lastBalance: currentBalance,
        lastSynced: new Date(),
      });

      logger.info(`Chase balance updated successfully: $${currentBalance}`);
      
      return { 
        balance: currentBalance,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      logger.error("Error updating Chase balance:", error);
      if (error instanceof https.HttpsError) {
        throw error;
      }
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  });
