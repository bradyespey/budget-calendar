import { getFirestore, Timestamp } from "firebase-admin/firestore";
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
      const savingsId = functions.config().monarch?.savings_id;
      
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
      
      // Find the checking, savings, and credit card accounts
      const accountTypeSummaries = result.data?.accountTypeSummaries || [];
      const allAccounts = accountTypeSummaries.flatMap((summary: any) => summary.accounts || []);
      const checkingAccount = allAccounts.find((acc: any) => String(acc.id) === String(checkingId));
      const savingsAccount = savingsId ? allAccounts.find((acc: any) => String(acc.id) === String(savingsId)) : null;
      
      // Calculate total credit card debt
      // Credit cards are in the first accountTypeSummaries array
      const creditCardSummary = accountTypeSummaries[0];
      const creditCardAccounts = creditCardSummary?.accounts || [];
      logger.info("Credit card accounts found:", creditCardAccounts.length);
      logger.info("Credit card accounts:", creditCardAccounts.map((acc: any) => `${acc.displayName}: ${acc.displayBalance}`));
      const totalCreditCardDebt = creditCardAccounts.reduce((sum: number, acc: any) => 
        sum + Math.abs(acc.displayBalance), 0
      );
      logger.info("Total credit card debt calculated:", totalCreditCardDebt);
      
      if (!checkingAccount) {
        logger.error("Chase checking account not found. Available accounts:", allAccounts.map((acc: any) => `${acc.displayName} (${acc.id})`));
        res.status(500).json({ 
          error: 'Chase checking account not found',
          availableAccounts: allAccounts.map((acc: any) => `${acc.displayName} (${acc.id})`)
        });
        return;
      }
      
      const now = new Date();
      const timestamp = now.toISOString();
      
      // Update checking account in Firestore
      await db.collection('accounts').doc('checking').set({
        id: 'checking',
        display_name: 'Chase Checking',
        lastBalance: checkingAccount.displayBalance,
        lastSynced: timestamp
      });
      
      const responseData: any = {
        checking: {
          balance: checkingAccount.displayBalance,
          accountName: checkingAccount.displayName,
          lastSynced: timestamp
        }
      };
      
      // Update savings account if configured
      if (savingsAccount) {
        await db.collection('accounts').doc('savings').set({
          id: 'savings',
          display_name: savingsAccount.displayName,
          lastBalance: savingsAccount.displayBalance,
          lastSynced: timestamp
        });
        
        // Track savings history for trend chart - only add if balance changed
        const lastSavingsHistory = await db.collection('savingsHistory')
          .orderBy('timestamp', 'desc')
          .limit(1)
          .get();
        
        const shouldAddHistoryPoint = lastSavingsHistory.empty || 
          lastSavingsHistory.docs[0].data().balance !== savingsAccount.displayBalance;
        
        if (shouldAddHistoryPoint) {
          await db.collection('savingsHistory').add({
            balance: savingsAccount.displayBalance,
            timestamp: now
          });
          
          // Clean up ALL duplicate data points with same balance (one-time cleanup)
          const allHistory = await db.collection('savingsHistory')
            .where('balance', '==', savingsAccount.displayBalance)
            .orderBy('timestamp', 'desc')
            .get();
          
          // Keep only the latest entry for each unique balance
          if (allHistory.docs.length > 1) {
            const docsToDelete = allHistory.docs.slice(1); // Keep first (latest), delete rest
            const batch = db.batch();
            docsToDelete.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            logger.info(`Cleaned up ${docsToDelete.length} duplicate savings history entries for balance ${savingsAccount.displayBalance}`);
          }
        }
        
        responseData.savings = {
          balance: savingsAccount.displayBalance,
          accountName: savingsAccount.displayName,
          lastSynced: timestamp
        };
      }
      
      // Update credit card debt
      await db.collection('accounts').doc('creditCards').set({
        id: 'creditCards',
        display_name: 'Total Credit Card Debt',
        lastBalance: totalCreditCardDebt,
        lastSynced: timestamp,
        accountCount: creditCardAccounts.length
      });
      
      responseData.creditCards = {
        balance: totalCreditCardDebt,
        accountName: 'Total Credit Card Debt',
        accountCount: creditCardAccounts.length,
        lastSynced: timestamp
      };
      
      await db.collection('admin').doc('functionTimestamps').set({
        updateBalance: Timestamp.now()
      }, { merge: true });
      
      res.status(200).json({ 
        success: true, 
        message: savingsAccount ? "Balances updated successfully" : "Checking balance updated successfully",
        data: responseData,
        timestamp: timestamp
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
