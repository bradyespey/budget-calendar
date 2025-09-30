import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

export const validateProjections = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      // Get settings to know projection days
      const settingsDoc = await db.collection('settings').doc('config').get();
      const settings = settingsDoc.data();
      const projectionDays = settings?.projectionDays || 30;
      
      // Get all bills
      const billsSnapshot = await db.collection('bills').get();
      const bills = billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      
      // Get all projections
      const projectionsSnapshot = await db.collection('projections').get();
      const projections = projectionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      
      // Filter projections to the date range
      const today = new Date().toISOString().split('T')[0];
      const endDate = new Date(Date.now() + projectionDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const filteredProjections = projections.filter(proj => {
        const projDate = proj.projDate;
        return projDate >= today && projDate <= endDate;
      }).sort((a, b) => a.projDate.localeCompare(b.projDate));
      
      // Create a map of expected bills by date
      const expectedBills = new Map<string, Set<string>>();
      const actualBills = new Map<string, Set<string>>();
      
      // Helper to create a unique bill key
      const billKey = (bill: any) => `${bill.name}|${bill.amount}|${bill.category}`;
      
      // Process all projections to get actual bills
      for (const proj of filteredProjections) {
        if (!proj.bills) continue;
        
        if (!actualBills.has(proj.projDate)) {
          actualBills.set(proj.projDate, new Set());
        }
        
        for (const bill of proj.bills) {
          actualBills.get(proj.projDate)!.add(billKey(bill));
        }
      }
      
      // For each projection date, check which bills should occur
      for (const proj of filteredProjections) {
        const projDate = new Date(proj.projDate);
        
        // Check each bill to see if it should occur on this date
        for (const bill of bills) {
          if (shouldBillOccurOnDate(bill, projDate)) {
            const dateStr = proj.projDate;
            if (!expectedBills.has(dateStr)) {
              expectedBills.set(dateStr, new Set());
            }
            expectedBills.get(dateStr)!.add(billKey(bill));
          }
        }
      }
      
      // Find missing bills
      const missingInProjections: any[] = [];
      
      // Check for missing bills
      for (const [date, expected] of expectedBills) {
        const actual = actualBills.get(date) || new Set();
        
        for (const billKey of expected) {
          if (!actual.has(billKey)) {
            const [name, amount, category] = billKey.split('|');
            const bill = bills.find(b => b.name === name && b.amount === Number(amount) && b.category === category);
            if (bill) {
              missingInProjections.push({
                bill: {
                  name: bill.name,
                  amount: bill.amount,
                  frequency: bill.frequency,
                  start_date: bill.startDate,
                  category: bill.category
                },
                expectedDate: date
              });
            }
          }
        }
      }
      
      const missingNames = [...new Set(missingInProjections.map(({ bill }) => bill.name))];
      const expectedCount = filteredProjections.length + missingInProjections.length;
      const foundCount = filteredProjections.length;
      
      return {
        isValid: missingInProjections.length === 0,
        missingInProjections,
        summary: {
          totalBills: bills.length,
          totalProjections: filteredProjections.length,
          missingCount: missingInProjections.length,
          extraCount: 0
        },
        message: `${foundCount}/${expectedCount} days found${missingNames.length > 0 ? `, ${missingNames.length} bill${missingNames.length > 1 ? 's' : ''} missing: ${missingNames.join(', ')}` : ', no bills missing!'}`,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error("Error validating projections:", error);
      throw new functions.https.HttpsError('internal', 'Validation failed');
    }
  }
);

// Helper function to check if a bill should occur on a given date
function shouldBillOccurOnDate(bill: any, date: Date): boolean {
  const billStart = new Date(bill.startDate);
  const billEnd = bill.endDate ? new Date(bill.endDate) : null;
  const repeatsEvery = Number(bill.repeats_every ?? bill.repeatsEvery ?? 1) || 1;

  // Check if date is within bill's active period
  if (date < billStart || (billEnd && date > billEnd)) {
    return false;
  }

  // For one-time bills, only check the start date
  if (bill.frequency === 'one-time') {
    return date.toISOString().split('T')[0] === billStart.toISOString().split('T')[0];
  }

  // For daily bills
  if (bill.frequency === 'daily') {
    const daysSinceStart = Math.floor((date.getTime() - billStart.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceStart >= 0 && daysSinceStart % repeatsEvery === 0;
  }

  // For weekly bills
  if (bill.frequency === 'weekly') {
    const daysSinceStart = Math.floor((date.getTime() - billStart.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceStart >= 0 && daysSinceStart % (7 * repeatsEvery) === 0;
  }

  // Handle "Every X weeks" frequencies
  if (bill.frequency.startsWith('every_') && bill.frequency.includes('_weeks')) {
    const weeksMatch = bill.frequency.match(/every_(\d+)_weeks/);
    if (weeksMatch) {
      const weekInterval = parseInt(weeksMatch[1]);
      const daysSinceStart = Math.floor((date.getTime() - billStart.getTime()) / (1000 * 60 * 60 * 24));
      return daysSinceStart >= 0 && daysSinceStart % (7 * weekInterval) === 0;
    }
  }

  // For biweekly bills
  if (bill.frequency === 'biweekly') {
    const daysSinceStart = Math.floor((date.getTime() - billStart.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceStart >= 0 && daysSinceStart % (14 * repeatsEvery) === 0;
  }

  // For monthly bills
  if (bill.frequency === 'monthly') {
    const monthsSinceStart = (date.getFullYear() - billStart.getFullYear()) * 12 + 
                            (date.getMonth() - billStart.getMonth());
    const billDay = billStart.getDate();
    const checkDay = date.getDate();
    
    // Handle end-of-month scenarios
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    
    if (monthsSinceStart >= 0 && monthsSinceStart % repeatsEvery === 0) {
      if (billDay > lastDayOfMonth) {
        return checkDay === lastDayOfMonth;
      } else {
        return checkDay === billDay;
      }
    }
  }

  // Handle "Every X months" frequencies
  if (bill.frequency.startsWith('every_') && bill.frequency.includes('_months')) {
    const monthsMatch = bill.frequency.match(/every_(\d+)_months/);
    if (monthsMatch) {
      const monthInterval = parseInt(monthsMatch[1]);
      const monthsSinceStart = (date.getFullYear() - billStart.getFullYear()) * 12 + 
                              (date.getMonth() - billStart.getMonth());
      const billDay = billStart.getDate();
      const checkDay = date.getDate();
      
      if (monthsSinceStart >= 0 && monthsSinceStart % monthInterval === 0) {
        // Handle end-of-month scenarios
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        
        if (billDay > lastDayOfMonth) {
          return checkDay === lastDayOfMonth;
        } else {
          return checkDay === billDay;
        }
      }
    }
  }

  // For semimonthly bills (1st & 15th)
  if (bill.frequency === 'semimonthly') {
    const checkDay = date.getDate();
    return checkDay === 1 || checkDay === 15;
  }

  // For semimonthly mid-end bills (15th & last day)
  if (bill.frequency === 'Semimonthly_mid_end' || bill.frequency === 'semimonthly_mid_end') {
    const checkDay = date.getDate();
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return checkDay === 15 || checkDay === lastDayOfMonth;
  }

  // For yearly bills
  if (bill.frequency === 'yearly') {
    const yearsSinceStart = date.getFullYear() - billStart.getFullYear();
    const billDay = billStart.getDate();
    const checkDay = date.getDate();
    
    if (yearsSinceStart >= 0 && yearsSinceStart % repeatsEvery === 0) {
      // Handle end-of-month scenarios for yearly bills too (e.g., Feb 29th)
      if (billStart.getMonth() === date.getMonth()) {
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        
        if (billDay > lastDayOfMonth) {
          return checkDay === lastDayOfMonth;
        } else {
          return checkDay === billDay;
        }
      }
    }
  }

  return false;
}
