import * as admin from "firebase-admin";
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
  const billDate = new Date(bill.start_date || bill.startDate);
  const repeatsEvery = Number(bill.repeats_every ?? bill.repeatsEvery ?? 1) || 1;
  
  // Check if the date is before the start date
  if (date < billDate) {
    return false;
  }
  
  // Check if the date is after the end date (if end_date exists)
  if (bill.end_date || bill.endDate) {
    const endDate = new Date(bill.end_date || bill.endDate);
    // Set to end of day for end_date to include the end date itself
    endDate.setHours(23, 59, 59, 999);
    if (date > endDate) {
      return false;
    }
  }
  
  // One-time bills only occur on their exact start date
  if (bill.frequency === 'one-time') {
    return billDate.toISOString().split('T')[0] === date.toISOString().split('T')[0];
  }
  
  if (bill.frequency === 'daily') return true;
  
  if (bill.frequency === 'weekly') {
    const daysDiff = Math.floor((date.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff >= 0 && daysDiff % (7 * repeatsEvery) === 0;
  }
  
  // Handle "Every X weeks" frequencies (e.g., every 2 weeks, every 3 weeks, etc.)
  if (bill.frequency.startsWith('every_') && bill.frequency.includes('_weeks')) {
    const weeksMatch = bill.frequency.match(/every_(\d+)_weeks/);
    if (weeksMatch) {
      const weekInterval = parseInt(weeksMatch[1]);
      const daysDiff = Math.floor((date.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff >= 0 && daysDiff % (7 * weekInterval) === 0;
    }
  }
  
  if (bill.frequency === 'biweekly') {
    // Bi-weekly occurs every 14 days (every 2 weeks)
    const daysDiff = Math.floor((date.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff >= 0 && daysDiff % (14 * repeatsEvery) === 0;
  }
  
  if (bill.frequency === 'monthly') {
    const billDay = billDate.getDate();
    const checkDay = date.getDate();
    
    // Handle end-of-month scenarios
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    
    if (billDay > lastDayOfMonth) {
      return checkDay === lastDayOfMonth;
    } else {
      return billDay === checkDay;
    }
  }
  
  // Handle "Every X months" frequencies (e.g., every 2 months, every 3 months, etc.)
  if (bill.frequency.startsWith('every_') && bill.frequency.includes('_months')) {
    const monthsMatch = bill.frequency.match(/every_(\d+)_months/);
    if (monthsMatch) {
      const monthInterval = parseInt(monthsMatch[1]);
      const billDay = billDate.getDate();
      const checkDay = date.getDate();
      
      // Calculate months difference
      const monthsDiff = (date.getFullYear() - billDate.getFullYear()) * 12 + 
                        (date.getMonth() - billDate.getMonth());
      
      // Check if we're on the right month interval and day
      if (monthsDiff >= 0 && monthsDiff % monthInterval === 0) {
        // Handle end-of-month scenarios
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        
        if (billDay > lastDayOfMonth) {
          return checkDay === lastDayOfMonth;
        } else {
          return billDay === checkDay;
        }
      }
    }
  }
  
  if (bill.frequency === 'Semimonthly_mid_end' || bill.frequency === 'semimonthly_mid_end') {
    const checkDay = date.getDate();
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    
    // Semimonthly_mid_end occurs on the 15th and last day of each month
    return checkDay === 15 || checkDay === lastDayOfMonth;
  }
  
  if (bill.frequency === 'semimonthly') {
    const checkDay = date.getDate();
    
    // Semimonthly occurs on the 1st and 15th of each month
    return checkDay === 1 || checkDay === 15;
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
  
  // First pass: Calculate all projections and find true highest/lowest/threshold breach
  const projectionDataList = [];
  let lowest = { balance: currentBalance, date: todayCST };
  let highest = { balance: currentBalance, date: todayCST };
  let thresholdBreach: { balance: number, date: string } | null = null;
  
  // Pre-compute all bill occurrences with adjustments for the entire projection period
  const billOccurrences = new Map<string, any[]>(); // dateStr -> bills[]
  
  // Initialize all projection dates
  for (let i = 0; i < projectionDays; i++) {
    const projectionDate = new Date(cstTime);
    projectionDate.setDate(projectionDate.getDate() + i);
    const dateStr = projectionDate.toISOString().split('T')[0];
    billOccurrences.set(dateStr, []);
  }
  
  // Helper function to determine if a bill should affect balance calculations
  const shouldAffectBalance = (bill: any) => {
    // Skip inactive bills (past credit card payments, etc.)
    if (bill.isActive === false) return false;
    
    // Skip bills from credit card accounts (they're already in the CC payment)
    // This applies to both manual and Monarch transactions
    if (bill.accountType === 'Credit Card') return false;
    
    // Credit card payment transactions affect balance (they hit checking)
    // Note: These are now 'one-time' bills, so they naturally only appear once
    if (bill.category && bill.category.toLowerCase().includes('credit card payment')) return true;
    
    // Everything else affects balance (manual budgets, checking account bills, income, etc.)
    return true;
  };
  
  // For each bill, find all its occurrences in the projection period and adjust them
  // NOTE: We process ALL bills for display, but only some affect balance
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
      // Only count bills that should affect balance (excludes credit card charges, etc.)
      // Bills preserve their original sign from Monarch:
      // - Negative amounts = expenses (subtract from balance)
      // - Positive amounts = income (add to balance)
      const billsAffectingBalance = billsToProcess.filter(bill => shouldAffectBalance(bill));
      
      const totalBillsToday = billsAffectingBalance.reduce((sum, bill) => sum + bill.amount, 0);
      runningBalance += totalBillsToday; // Add amounts directly (negative = expense, positive = income)
      balanceToStore = runningBalance;
      logger.info(`Day ${i} (${dateStr}): ${billsToProcess.length} bills (${billsAffectingBalance.length} affect balance) totaling $${totalBillsToday}, new balance: $${balanceToStore}`);
    }
    
    // Track true highest and lowest
    if (balanceToStore < lowest.balance) {
      lowest = { balance: balanceToStore, date: dateStr };
    }
    if (balanceToStore > highest.balance) {
      highest = { balance: balanceToStore, date: dateStr };
    }
    
    // Track first threshold breach
    if (!thresholdBreach && balanceToStore < settings.balanceThreshold) {
      thresholdBreach = { balance: balanceToStore, date: dateStr };
    }
    
    // Store projection data for second pass
    projectionDataList.push({
      projDate: dateStr,
      projectedBalance: balanceToStore,
      bills: billsToProcess,
      dateStr
    });
  }
  
  // Second pass: Save projections with correct highest/lowest/threshold breach flags
  for (const projData of projectionDataList) {
    const projectionData = {
      projDate: projData.projDate,
      projectedBalance: projData.projectedBalance,
      bills: projData.bills,
      lowest: projData.dateStr === lowest.date,
      highest: projData.dateStr === highest.date,
      thresholdBreach: thresholdBreach && projData.dateStr === thresholdBreach.date
    };
    
    await db.collection('projections').doc(projData.dateStr).set(projectionData);
    logger.info(`Created projection for ${projData.dateStr} with balance ${projData.projectedBalance} (lowest: ${projectionData.lowest}, highest: ${projectionData.highest}, thresholdBreach: ${projectionData.thresholdBreach})`);
  }
  
  // Calculate Monthly Cash Flow summaries (only use bills that affect balance)
  const billsForCashFlow = bills.filter(bill => shouldAffectBalance(bill));
  const monthlyCashFlow = calculateMonthlyCashFlow(billsForCashFlow);
  
  // Store Monthly Cash Flow in Firestore
  await db.collection('monthlyCashFlow').doc('current').set({
    ...monthlyCashFlow,
    lastUpdated: new Date(),
    projectionDays: projectionDays
  });
  
  logger.info(`Completed projections for ${projectionDays} days and Monthly Cash Flow calculation`);
  } catch (error) {
    logger.error("Error in computeProjections:", error);
    throw error;
  }
}

// Monthly Cash Flow calculation function
function calculateMonthlyCashFlow(bills: any[]) {
  const categories: Record<string, { monthly: number; yearly: number }> = {};
  const summary = {
    oneTime: { bills: 0, income: 0 },
    daily: { bills: 0, income: 0 },
    weekly: { bills: 0, income: 0 },
    biweekly: { bills: 0, income: 0 },
    semimonthly: { bills: 0, income: 0 },
    monthly: { bills: 0, income: 0 },
    yearly: { bills: 0, income: 0 },
  };
  let totalMonthlyIncome = 0;
  let totalMonthlyBills = 0;

  bills.forEach(raw => {
    // Normalize bill fields defensively
    const amount = Number(raw.amount) || 0;
    const frequency = (raw.frequency || 'monthly') as string;
    const repeatsEvery = Number(raw.repeats_every ?? raw.repeatsEvery ?? 1) || 1;
    const category = (raw.category || 'uncategorized').toLowerCase();

    if (!categories[category]) {
      categories[category] = { monthly: 0, yearly: 0 };
    }

    let monthlyAmount = 0;
    let yearlyAmount = 0;
    switch (frequency) {
      case 'daily':
        monthlyAmount = (amount * 30.44) / repeatsEvery;
        yearlyAmount = (amount * 365.25) / repeatsEvery;
        summary.daily[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
        break;
      case 'weekly':
        // Weekly = 52.18 times per year
        monthlyAmount = (amount * 4.35) / repeatsEvery;  // ~4.35 weeks per month
        yearlyAmount = (amount * 52.18) / repeatsEvery;
        summary.weekly[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
        break;
      case 'biweekly':
        // Biweekly = every 2 weeks = 26 times per year = 2.167 times per month
        monthlyAmount = (amount * 26 / 12) / repeatsEvery;
        yearlyAmount = (amount * 26) / repeatsEvery;
        summary.biweekly[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
        break;
      case 'semimonthly':
        // Semimonthly = twice per month = 24 times per year = 2.0 times per month
        monthlyAmount = (amount * 2.0) / repeatsEvery;
        yearlyAmount = (amount * 24) / repeatsEvery;
        summary.semimonthly[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
        break;
      case 'Semimonthly_mid_end':
      case 'semimonthly_mid_end':
        // Semimonthly mid-end = twice per month = 24 times per year = 2.0 times per month
        monthlyAmount = (amount * 2.0) / repeatsEvery;
        yearlyAmount = (amount * 24) / repeatsEvery;
        summary.semimonthly[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
        break;
      case 'monthly':
        monthlyAmount = amount / repeatsEvery;
        yearlyAmount = (amount * 12) / repeatsEvery;
        summary.monthly[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
        break;
      case 'yearly':
        monthlyAmount = amount / (12 * repeatsEvery);
        yearlyAmount = amount / repeatsEvery;
        summary.yearly[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
        break;
      default:
        // Handle "Every X months" and "Every X weeks" patterns
        if (frequency.startsWith('every_') && frequency.includes('_months')) {
          const monthsMatch = frequency.match(/every_(\d+)_months/);
          if (monthsMatch) {
            const monthInterval = parseInt(monthsMatch[1]);
            monthlyAmount = (amount * 12) / (monthInterval * repeatsEvery);
            yearlyAmount = amount / (monthInterval * repeatsEvery);
            summary.monthly[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
          } else {
            // Fallback to monthly
            monthlyAmount = amount / repeatsEvery;
            yearlyAmount = (amount * 12) / repeatsEvery;
            summary.monthly[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
          }
        } else if (frequency.startsWith('every_') && frequency.includes('_weeks')) {
          const weeksMatch = frequency.match(/every_(\d+)_weeks/);
          if (weeksMatch) {
            const weekInterval = parseInt(weeksMatch[1]);
            monthlyAmount = (amount * 52.18) / (weekInterval * 12 * repeatsEvery);
            yearlyAmount = (amount * 52.18) / (weekInterval * repeatsEvery);
            summary.weekly[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
          } else {
            // Fallback to weekly
            monthlyAmount = (amount * 4.35) / repeatsEvery;
            yearlyAmount = (amount * 52.18) / repeatsEvery;
            summary.weekly[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
          }
        } else {
          // Treat unknown frequency as monthly
          monthlyAmount = amount / repeatsEvery;
          yearlyAmount = (amount * 12) / repeatsEvery;
          summary.monthly[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
        }
        break;
      case 'one-time':
        summary.oneTime[amount >= 0 ? 'income' : 'bills'] += Math.abs(amount);
        break;
    }

    categories[category].monthly += monthlyAmount;
    categories[category].yearly += yearlyAmount;

    if (amount >= 0) {
      totalMonthlyIncome += monthlyAmount;
    } else {
      totalMonthlyBills += Math.abs(monthlyAmount);
    }
  });

  return {
    categories,
    summary,
    monthlyTotals: {
      income: totalMonthlyIncome,
      bills: totalMonthlyBills,
      leftover: totalMonthlyIncome - totalMonthlyBills,
    }
  };
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
      
      // Update function timestamp
      try {
        await admin.firestore().doc('admin/functionTimestamps').set({
          budgetProjection: admin.firestore.Timestamp.now()
        }, { merge: true });
        logger.info('Updated budgetProjection timestamp');
      } catch (timestampError) {
        logger.warn('Failed to update timestamp:', timestampError);
      }
      
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
