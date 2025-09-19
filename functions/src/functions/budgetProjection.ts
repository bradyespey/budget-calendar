import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

async function computeProjections(settings: any) {
  const billsSnapshot = await db.collection('bills').get();
  const bills = billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
  
  const accountsSnapshot = await db.collection('accounts').get();
  let accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
  
  if (settings.manualBalanceOverride) {
    accounts = accounts.map(account => ({
      ...account,
      lastBalance: settings.manualBalanceOverride
    }));
  }
  
  if (accounts.length === 0) {
    logger.warn("No accounts found, cannot compute projections");
    return;
  }
  
  const currentBalance = accounts[0].lastBalance;
  
  // Clear existing projections
  const projectionsRef = db.collection('projections');
  const existingProjections = await projectionsRef.get();
  const batch = db.batch();
  
  existingProjections.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  const projectionDays = settings.projectionDays || 7;
  let runningBalance = currentBalance;
  let lowest = { balance: currentBalance, date: new Date().toISOString().split('T')[0] };
  let highest = { balance: currentBalance, date: new Date().toISOString().split('T')[0] };
  
  for (let i = 0; i <= projectionDays; i++) {
    const projectionDate = new Date();
    projectionDate.setDate(projectionDate.getDate() + i);
    const dateStr = projectionDate.toISOString().split('T')[0];
    
    const billsDueToday = bills.filter(bill => {
      const billDate = new Date(bill.startDate);
      const today = new Date(dateStr);
      
      if (bill.frequency === 'daily') return true;
      if (bill.frequency === 'weekly') {
        const daysDiff = Math.floor((today.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff >= 0 && daysDiff % 7 === 0;
      }
      if (bill.frequency === 'monthly') {
        return billDate.getDate() === today.getDate();
      }
      if (bill.frequency === 'yearly') {
        return billDate.getDate() === today.getDate() && billDate.getMonth() === today.getMonth();
      }
      
      return false;
    });
    
    const totalBillsToday = billsDueToday.reduce((sum, bill) => sum + bill.amount, 0);
    runningBalance -= totalBillsToday;
    
    if (runningBalance < lowest.balance) {
      lowest = { balance: runningBalance, date: dateStr };
    }
    if (runningBalance > highest.balance) {
      highest = { balance: runningBalance, date: dateStr };
    }
    
    const projectionData = {
      projDate: dateStr,
      projectedBalance: runningBalance,
      bills: billsDueToday,
      lowest: runningBalance === lowest.balance,
      highest: runningBalance === highest.balance
    };
    
    await db.collection('projections').doc(dateStr).set(projectionData);
  }
}

export const budgetProjection = functions.region(region).https.onRequest(
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      const settingsDocRef = db.collection('settings').doc('config');
      const settingsDoc = await settingsDocRef.get();
      let settings;
      
      if (!settingsDoc.exists) {
        const defaultSettings = {
          projectionDays: 7,
          balanceThreshold: 1000,
          manualBalanceOverride: null,
          lastProjectedAt: null
        };
        
        await settingsDocRef.set(defaultSettings);
        settings = defaultSettings;
      } else {
        settings = settingsDoc.data();
      }

      await computeProjections(settings);

      await settingsDocRef.update({
        lastProjectedAt: new Date()
      });
      
      await db.collection('admin').doc('functionTimestamps').set({
        budgetProjection: new Date()
      }, { merge: true });
      
      res.status(200).json({ 
        success: true, 
        message: "Budget projection completed successfully",
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error("Error in budget projection:", error);
      res.status(500).json({ 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);
