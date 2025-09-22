import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

async function computeProjections(settings: any) {
  try {
    logger.info("Starting computeProjections with settings:", settings);
    
    const billsSnapshot = await db.collection('bills').get();
    const bills = billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
    
    logger.info(`Found ${bills.length} bills`);
  
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
  
  // Use CST timezone for consistent day calculations
  // Always use the current CST date as "today" regardless of when the function runs
  const now = new Date();
  
  // Calculate CST time (UTC-6, but we need to be more careful about DST)
  // For simplicity, we'll use a fixed CST offset and let the user know
  const cstOffset = -6; // CST is UTC-6
  const cstTime = new Date(now.getTime() + (cstOffset * 60 * 60 * 1000));
  const todayCST = cstTime.toISOString().split('T')[0];
  
  logger.info(`Current UTC time: ${now.toISOString()}`);
  logger.info(`Current CST time: ${cstTime.toISOString()}`);
  logger.info(`Today CST date: ${todayCST}`);
  logger.info(`Projection days: ${projectionDays}`);
  
  // First pass: Calculate all projections and find true highest/lowest
  const projectionDataList = [];
  let lowest = { balance: currentBalance, date: todayCST };
  let highest = { balance: currentBalance, date: todayCST };
  
  for (let i = 0; i < projectionDays; i++) {
    const projectionDate = new Date(cstTime);
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
    
    // For today (i === 0), show transactions but don't update balance projection yet
    // Balance projection starts from tomorrow since today's transactions are likely processed
    let balanceToStore = runningBalance;
    
    if (i > 0) {
      // Apply bills to running balance starting from tomorrow
      // CURRENT DATA: Bills are stored as negative amounts but should be treated as expenses
      // So we need to ADD the bill amounts (which are negative) to SUBTRACT from balance
      const totalBillsToday = billsDueToday.reduce((sum, bill) => sum + bill.amount, 0);
      runningBalance += totalBillsToday; // Add negative amounts = subtract from balance
      balanceToStore = runningBalance;
      logger.info(`Day ${i} (${dateStr}): ${billsDueToday.length} bills totaling $${totalBillsToday}, new balance: $${balanceToStore}`);
    }
    
    // Track true highest and lowest
    if (balanceToStore < lowest.balance) {
      lowest = { balance: balanceToStore, date: dateStr };
    }
    if (balanceToStore > highest.balance) {
      highest = { balance: balanceToStore, date: dateStr };
    }
    
    // Store projection data for second pass
    projectionDataList.push({
      projDate: dateStr,
      projectedBalance: balanceToStore,
      bills: billsDueToday,
      dateStr
    });
  }
  
  // Second pass: Save projections with correct highest/lowest flags
  for (const projData of projectionDataList) {
    const projectionData = {
      projDate: projData.projDate,
      projectedBalance: projData.projectedBalance,
      bills: projData.bills,
      lowest: projData.dateStr === lowest.date,
      highest: projData.dateStr === highest.date
    };
    
    await db.collection('projections').doc(projData.dateStr).set(projectionData);
    logger.info(`Created projection for ${projData.dateStr} with balance ${projData.projectedBalance} (lowest: ${projectionData.lowest}, highest: ${projectionData.highest})`);
  }
  
  logger.info(`Completed projections for ${projectionDays} days`);
  } catch (error) {
    logger.error("Error in computeProjections:", error);
    throw error;
  }
}

export const budgetProjection = functions.region(region).https.onRequest(
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
