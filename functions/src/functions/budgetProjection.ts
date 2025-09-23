import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";
import { isWeekend } from "date-fns";

const db = getFirestore();
const region = 'us-central1';

// Holiday and date adjustment logic
async function fetchUSHolidays(start: Date, end: Date): Promise<Set<string>> {
  const holidays = new Set<string>();
  for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);
      if (res.ok) {
        const data = await res.json();
        data.forEach((h: { date: string }) => holidays.add(h.date));
      }
    } catch (error) {
      logger.warn(`Failed to fetch holidays for ${year}:`, error);
    }
  }
  return holidays;
}

function adjustTransactionDate(date: Date, isPaycheck: boolean, holidays: Set<string>): Date {
  let d = new Date(date);
  const dateStr = (d: Date) => d.toISOString().split('T')[0];
  
  while (true) {
    if (isPaycheck) {
      // Paychecks move to previous weekday (not weekend or holiday)
      if (isWeekend(d)) {
        d.setDate(d.getDate() - 1);
        continue;
      }
      if (holidays.has(dateStr(d))) {
        d.setDate(d.getDate() - 1);
        continue;
      }
    } else {
      // Bills move to next weekday (not weekend or holiday)
      if (isWeekend(d)) {
        // Move to next Monday (or Tuesday if Monday is a holiday)
        d.setDate(d.getDate() + (8 - d.getDay()) % 7);
        continue;
      }
      if (holidays.has(dateStr(d))) {
        d.setDate(d.getDate() + 1);
        continue;
      }
    }
    break;
  }
  return d;
}

function shouldBillOccurOnDate(bill: any, date: Date): boolean {
  const billDate = new Date(bill.startDate);
  
  if (bill.frequency === 'daily') return true;
  if (bill.frequency === 'weekly') {
    const daysDiff = Math.floor((date.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff >= 0 && daysDiff % 7 === 0;
  }
  if (bill.frequency === 'monthly') {
    const billDay = billDate.getDate();
    const checkDay = date.getDate();
    
    // Handle end-of-month scenarios
    // If the bill is scheduled for the 29th, 30th, or 31st, but the current month doesn't have that many days,
    // schedule it on the last day of the month
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    
    if (billDay > lastDayOfMonth) {
      // Bill day doesn't exist in this month, so use the last day of the month
      return checkDay === lastDayOfMonth;
    } else {
      // Normal case: bill day exists in this month
      return billDay === checkDay;
    }
  }
  if (bill.frequency === 'Semimonthly_mid_end' || bill.frequency === 'semimonthly_mid_end') {
    const checkDay = date.getDate();
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    
    // Semimonthly_mid_end occurs on the 15th and last day of each month
    return checkDay === 15 || checkDay === lastDayOfMonth;
  }
  if (bill.frequency === 'yearly') {
    const billDay = billDate.getDate();
    const checkDay = date.getDate();
    
    // Handle end-of-month scenarios for yearly bills too (e.g., Feb 29th)
    if (billDate.getMonth() === date.getMonth()) {
      const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      
      if (billDay > lastDayOfMonth) {
        return checkDay === lastDayOfMonth;
      } else {
        return billDay === checkDay;
      }
    }
  }
  
  return false;
}


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
  
  // Fetch holidays for the projection period
  const endDate = new Date(cstTime);
  endDate.setDate(endDate.getDate() + projectionDays);
  const holidays = await fetchUSHolidays(cstTime, endDate);
  logger.info(`Fetched ${holidays.size} holidays for projection period`);
  
  // First pass: Calculate all projections and find true highest/lowest
  const projectionDataList = [];
  let lowest = { balance: currentBalance, date: todayCST };
  let highest = { balance: currentBalance, date: todayCST };
  
  // Pre-compute all bill occurrences with adjustments for the entire projection period
  const billOccurrences = new Map<string, any[]>(); // dateStr -> bills[]
  
  // Initialize all projection dates
  for (let i = 0; i < projectionDays; i++) {
    const projectionDate = new Date(cstTime);
    projectionDate.setDate(projectionDate.getDate() + i);
    const dateStr = projectionDate.toISOString().split('T')[0];
    billOccurrences.set(dateStr, []);
  }
  
  // For each bill, find all its occurrences in the projection period and adjust them
  for (const bill of bills) {
    for (let i = 0; i < projectionDays; i++) {
      const checkDate = new Date(cstTime);
      checkDate.setDate(checkDate.getDate() + i);
      
      if (shouldBillOccurOnDate(bill, checkDate)) {
        if (bill.frequency === 'daily') {
          // Daily bills don't get adjusted
          const dateStr = checkDate.toISOString().split('T')[0];
          if (billOccurrences.has(dateStr)) {
            billOccurrences.get(dateStr)!.push(bill);
          }
        } else {
          // Adjust the date for weekends/holidays
          const isPaycheck = bill.category && bill.category.toLowerCase() === 'paycheck';
          const adjustedDate = adjustTransactionDate(checkDate, isPaycheck, holidays);
          const adjustedDateStr = adjustedDate.toISOString().split('T')[0];
          
          // Add to the adjusted date if it's within our projection period
          if (billOccurrences.has(adjustedDateStr)) {
            billOccurrences.get(adjustedDateStr)!.push(bill);
          }
        }
      }
    }
  }
  
  // Now process each projection date
  for (let i = 0; i < projectionDays; i++) {
    const projectionDate = new Date(cstTime);
    projectionDate.setDate(projectionDate.getDate() + i);
    const dateStr = projectionDate.toISOString().split('T')[0];
    
    // Get the bills for this date (already adjusted)
    const billsToProcess = billOccurrences.get(dateStr) || [];
    
    // For today (i === 0), show transactions but don't update balance projection yet
    // Balance projection starts from tomorrow since today's transactions are likely processed
    let balanceToStore = runningBalance;
    
    if (i > 0) {
      // Apply bills to running balance starting from tomorrow
      // Bills now preserve their original sign from Monarch:
      // - Negative amounts = expenses (subtract from balance)
      // - Positive amounts = income (add to balance)
      const totalBillsToday = billsToProcess.reduce((sum, bill) => sum + bill.amount, 0);
      runningBalance += totalBillsToday; // Add amounts directly (negative = expense, positive = income)
      balanceToStore = runningBalance;
      logger.info(`Day ${i} (${dateStr}): ${billsToProcess.length} bills totaling $${totalBillsToday}, new balance: $${balanceToStore}`);
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
      bills: billsToProcess,
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
      
      // Override projectionDays from request body if provided
      if (req.body && req.body.projectionDays && settings) {
        settings.projectionDays = req.body.projectionDays;
        logger.info(`Using projectionDays from request: ${settings.projectionDays}`);
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
