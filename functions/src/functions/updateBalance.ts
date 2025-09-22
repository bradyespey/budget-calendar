import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

export const updateBalance = functions.region(region).https.onRequest(
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      const monarchToken = functions.config().monarch?.token;
      const checkingId = functions.config().monarch?.checking_id;
      
      if (!monarchToken || !checkingId) {
        res.status(500).json({ error: 'Monarch credentials not configured' });
        return;
      }
      
      // Call Monarch GraphQL API directly
      const response = await fetch('https://api.monarchmoney.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${monarchToken}`
        },
        body: JSON.stringify({
          operationName: 'Web_GetAccountsPage',
          query: `
            query Web_GetAccountsPage {
              accountTypeSummaries {
                accounts { id displayName displayBalance }
              }
            }
          `
        })
      });
      
      if (!response.ok) {
        res.status(500).json({ error: `Monarch API error: ${response.status}` });
        return;
      }
      
      const result = await response.json();
      logger.info("Monarch API response:", result);
      
      // Find the checking account
      const accountTypeSummaries = result.data?.accountTypeSummaries || [];
      const allAccounts = accountTypeSummaries.flatMap((summary: any) => summary.accounts || []);
      const checkingAccount = allAccounts.find((acc: any) => String(acc.id) === String(checkingId));
      
      if (!checkingAccount) {
        logger.error("Chase checking account not found. Available accounts:", allAccounts.map((acc: any) => `${acc.displayName} (${acc.id})`));
        res.status(500).json({ 
          error: 'Chase checking account not found',
          availableAccounts: allAccounts.map((acc: any) => `${acc.displayName} (${acc.id})`)
        });
        return;
      }
      
      // Update account in Firestore
      await db.collection('accounts').doc('checking').set({
        id: 'checking',
        display_name: 'Chase Checking',
        lastBalance: checkingAccount.displayBalance,
        lastSynced: new Date().toISOString()
      });
      
      await db.collection('admin').doc('functionTimestamps').set({
        updateBalance: new Date()
      }, { merge: true });
      
      res.status(200).json({ 
        success: true, 
        message: "Balance updated successfully",
        data: { 
          balance: checkingAccount.displayBalance,
          accountName: checkingAccount.displayName,
          lastSynced: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error("Error updating balance:", error);
      res.status(500).json({ 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);
