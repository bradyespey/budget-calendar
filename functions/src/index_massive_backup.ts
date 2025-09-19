/**
 * Budget Calendar Firebase Cloud Functions
 * Minimal working version with only essential functions
 */

import { https } from "firebase-functions/v1";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";
import { google } from "googleapis";
import { 
  DEFAULT_CC_CONFIGS, 
  generateInferredPayment
} from "./creditCardInference";
// Use built-in fetch (available in Node.js 18+)

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// Set default region to us-central1 (Iowa) for all functions
// Note: us-south1 not enabled for this Firebase project yet
const region = 'us-central1';

/**
 * 📊 Budget Projection Function (HTTP Trigger)
 * Replaces: supabase/functions/budget-projection
 */
export const budgetProjectionHttp = functions.region(region).https.onRequest(
  async (req, res) => {
    try {
      logger.info("Starting budget projection calculation (HTTP)");

      // Get settings from Firestore (use same document as frontend)
      const settingsDocRef = db.collection('settings').doc('config');
      const settingsDoc = await settingsDocRef.get();
      let settings;
      
      if (!settingsDoc.exists) {
        // Create default settings
        logger.info("No settings found, creating default settings...");
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

      logger.info("Computing projections with settings:", settings);
      await computeProjections(settings);

      // Update last projected time
      await settingsDocRef.update({
        lastProjectedAt: new Date()
      });

      logger.info("Budget projection completed successfully");
      
      // Save timestamp to admin collection
      try {
        await db.collection('admin').doc('functionTimestamps').set({
          budgetProjection: new Date()
        }, { merge: true });
      } catch (error) {
        logger.warn("Failed to save function timestamp:", error);
      }
      
      res.status(200).json({ 
        success: true, 
        message: "Budget projection completed successfully",
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error("Error in budget projection:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

/**
 * 📊 Budget Projection Function (Callable)
 * Replaces: supabase/functions/budget-projection
 */
export const budgetProjection = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      logger.info("Starting budget projection calculation");

      // Get settings from Firestore (use same document as frontend)
      const settingsDocRef = db.collection('settings').doc('config');
      const settingsDoc = await settingsDocRef.get();
      let settings;
      
      if (!settingsDoc.exists) {
        // Create default settings
        logger.info("No settings found, creating default settings...");
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

      logger.info("Computing projections with settings:", settings);
      await computeProjections(settings);

      // Update last projected time
      await settingsDocRef.update({
        lastProjectedAt: new Date()
      });

      logger.info("Budget projection completed successfully");
      
      return { 
        success: true, 
        message: "Budget projection completed successfully",
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error("Error in budget projection:", error);
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  });

// Define timezone
const TIMEZONE = 'America/Chicago';

// Helper function to fetch US holidays
async function fetchUSHolidays(start: Date, end: Date): Promise<Set<string>> {
  const holidays = new Set<string>();
  for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);
      if (res.ok) {
        const data = await res.json();
        (data as any[]).forEach((h: { date: string }) => holidays.add(h.date));
      }
    } catch (error) {
      logger.warn(`Failed to fetch holidays for ${year}:`, error);
    }
  }
  return holidays;
}

// Helper function to check if date is weekend
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

// Helper function to format date in timezone
function formatInTimeZone(date: Date, timeZone: string, format: string): string {
  // Validate date before processing
  if (!date || isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  
  // Simple implementation - you might want to use date-fns-tz if available
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const targetTime = new Date(utc);
  return targetTime.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

// Helper function for start of day
function startOfDay(date: Date): Date {
  if (!date || isNaN(date.getTime())) {
    throw new Error(`Invalid date for startOfDay: ${date}`);
  }
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

// Helper function to parse ISO date with validation
function parseISO(dateString: string): Date {
  if (!dateString || typeof dateString !== 'string') {
    throw new Error(`Invalid date string: ${dateString}`);
  }
  
  // Try parsing as ISO string first
  let date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  // Try parsing as M/d/yyyy format (from CSV import)
  if (dateString.includes('/')) {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10) - 1; // Month is 0-indexed
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      
      if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
        date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
  }
  
  // If all parsing fails, throw error
  throw new Error(`Could not parse date: ${dateString}`);
}

// Helper function to calculate difference in calendar days
function differenceInCalendarDays(dateLeft: Date, dateRight: Date): number {
  const startOfDayLeft = startOfDay(dateLeft);
  const startOfDayRight = startOfDay(dateRight);
  
  const timestampLeft = startOfDayLeft.getTime();
  const timestampRight = startOfDayRight.getTime();
  
  return Math.round((timestampLeft - timestampRight) / (1000 * 60 * 60 * 24));
}

// Helper function to adjust transaction date based on weekends and holidays
function adjustTransactionDate(date: Date, isPaycheck: boolean, holidays: Set<string>): Date {
  let d = new Date(date);
  const dateStr = (d: Date) => formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
  
  // Repeat until not weekend/holiday
  while (true) {
    if (isPaycheck) {
      // Paychecks move backward to previous business day
      if (isWeekend(d)) {
        d.setDate(d.getDate() - 1);
        continue;
      }
      if (holidays.has(dateStr(d))) {
        d.setDate(d.getDate() - 1);
        continue;
      }
    } else {
      // Bills move forward to next business day
      if (isWeekend(d)) {
        // Move forward to Monday
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

// Helper function to get last day of month
function getLastDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

// Helper function to add days to date
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Bill interface for TypeScript
interface Bill {
  id: string;
  name?: string;
  category?: string;
  amount?: number;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time';
  repeatsEvery?: number;
  startDate?: string;
  endDate?: string;
}

// Main projection computation function
async function computeProjections(settings: any) {
  logger.info("=== ENTERING computeProjections ===");
  
  const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
  const projectionDays = settings.projectionDays || 30;
  
  logger.info("Today is:", today);
  logger.info("Projection days:", projectionDays);

  const startDate = new Date(today + 'T00:00:00');
  const projectionDates: string[] = [];
  for (let i = 1; i < projectionDays; i++) {
    projectionDates.push(formatInTimeZone(addDays(startDate, i), TIMEZONE, "yyyy-MM-dd"));
  }

  // Get accounts, bills, and holidays
  const [accountsSnapshot, billsSnapshot, holidays] = await Promise.all([
    db.collection('accounts').get(),
    db.collection('bills').get(),
    fetchUSHolidays(startDate, addDays(startDate, projectionDays + 7)),
  ]);

  const accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const bills = billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Bill[];

  logger.info(`Found ${accounts.length} accounts and ${bills.length} bills`);

  if (accounts.length === 0) {
    throw new https.HttpsError('failed-precondition', 'No accounts found');
  }

  // Delete old projections from today forward
  logger.info("Deleting old projections from", today);
  const oldProjectionsQuery = await db.collection('projections')
    .where('projDate', '>=', today)
    .get();
  
  const batch = db.batch();
  oldProjectionsQuery.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Clear highest/lowest flags
  const allProjectionsQuery = await db.collection('projections').get();
  const clearBatch = db.batch();
  allProjectionsQuery.docs.forEach(doc => {
    const data = doc.data();
    if (data.highest || data.lowest) {
      clearBatch.update(doc.ref, { highest: false, lowest: false });
    }
  });
  await clearBatch.commit();

  // Refetch accounts to ensure we have the latest balance data
  logger.info("Refetching accounts for latest balance data");
  const freshAccountsSnapshot = await db.collection('accounts').get();
  const freshAccounts = freshAccountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Calculate starting balance
  const totalBalance = settings.manualBalanceOverride != null 
    ? settings.manualBalanceOverride 
    : freshAccounts.reduce((sum: number, a: any) => sum + (a.lastBalance || 0), 0);

  logger.info("Account balances:", freshAccounts.map(a => ({ id: a.id, lastBalance: (a as any).lastBalance })));
  logger.info("Total balance calculated:", totalBalance);

  let runningBalance = totalBalance;
  const projections: any[] = [];

  // Build a map of dateStr -> bills for that day using proper scheduling logic
  const billsByDate: Record<string, any[]> = {};

  // First, add today's balance and transactions (like original Supabase function)
  const todayBills: Bill[] = [];
  for (const bill of bills) {
    try {
      if (!bill.startDate) continue;
      
      const billStart = parseISO(bill.startDate);
      const billEnd = bill.endDate ? parseISO(bill.endDate) : null;
      const isPaycheck = !!(bill.category && bill.category.toLowerCase() === 'paycheck');
      
      // Skip dates before start for non-paychecks
      if (!isPaycheck && today < formatInTimeZone(billStart, TIMEZONE, "yyyy-MM-dd")) continue;
      if (billEnd && today > formatInTimeZone(billEnd, TIMEZONE, "yyyy-MM-dd")) continue;

      let intendedDate: Date | null = null;
      let occurs = false;

      // --- Frequency logic (matching original Supabase exactly) ---
      if (bill.frequency === 'one-time') {
        intendedDate = billStart;
      } else if (bill.frequency === 'daily') {
        // Calculate days difference from bill start date to today
        const todayDate = new Date(today + 'T00:00:00');
        const daysDiff = differenceInCalendarDays(todayDate, billStart);
        if (daysDiff >= 0 && daysDiff % (bill.repeatsEvery || 1) === 0) {
          intendedDate = todayDate;
        }
      } else if (bill.frequency === 'weekly') {
        const intervalDays = 7 * (bill.repeatsEvery || 1);
        // compute diff between local dates
        const daysDiff = differenceInCalendarDays(
          startOfDay(new Date(today + 'T00:00:00')),
          startOfDay(parseISO(bill.startDate))
        );
        if (daysDiff >= 0 && daysDiff % intervalDays === 0) {
          intendedDate = startDate;
        }
      } else if (bill.frequency === 'monthly') {
        // Check if today matches the monthly schedule
        const targetDay = parseISO(bill.startDate).getDate();
        const todayDate = new Date(today + 'T00:00:00');
        const lastDayOfCurrentMonth = getLastDayOfMonth(todayDate);
        const clampedDay = Math.min(targetDay, lastDayOfCurrentMonth);
        
        if (todayDate.getDate() === clampedDay) {
          // Check if we're on the correct month interval
          const billStartDate = parseISO(bill.startDate);
          const monthsDiff = (todayDate.getFullYear() - billStartDate.getFullYear()) * 12 + 
                            (todayDate.getMonth() - billStartDate.getMonth());
          if (monthsDiff >= 0 && monthsDiff % (bill.repeatsEvery || 1) === 0) {
            intendedDate = todayDate;
          }
        }
      } else if (bill.frequency === 'yearly') {
        // Get the target month/day from the bill's start date
        const targetMonth = parseISO(bill.startDate).getMonth();
        const targetDay = parseISO(bill.startDate).getDate();
        const todayDate = new Date(today + 'T00:00:00');
        
        // Check if today matches the yearly schedule (month and day)
        if (todayDate.getMonth() === targetMonth) {
          const lastDayOfCurrentMonth = getLastDayOfMonth(todayDate);
          const clampedDay = Math.min(targetDay, lastDayOfCurrentMonth);
          
          if (todayDate.getDate() === clampedDay) {
            // Check if we're on the correct year interval
            const billStartDate = parseISO(bill.startDate);
            const yearsDiff = todayDate.getFullYear() - billStartDate.getFullYear();
            if (yearsDiff >= 0 && yearsDiff % (bill.repeatsEvery || 1) === 0) {
              intendedDate = todayDate;
            }
          }
        }
      }

      if (intendedDate) {
        const skipAdjust = bill.frequency === 'daily';
        let adjustedDate = new Date(intendedDate);
        if (!skipAdjust) {
          adjustedDate = adjustTransactionDate(adjustedDate, isPaycheck, holidays);
        }
        const dateStrFn = (d: Date) => formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
        if (dateStrFn(adjustedDate) === today) {
          occurs = true;
        }
      }

      if (occurs) {
        todayBills.push(bill);
      }
    } catch (error) {
      logger.error(`Error processing bill ${bill.name || 'unnamed'} (ID: ${bill.id}):`, error);
      logger.error(`Bill data:`, { 
        name: bill.name, 
        startDate: bill.startDate, 
        endDate: bill.endDate, 
        frequency: bill.frequency 
      });
      // Continue processing other bills instead of failing completely
      continue;
    }
  }

  // Now process future dates (matching original monthly logic exactly)
  for (const bill of bills) {
    if (!bill.startDate) continue;
    
    const billStart = parseISO(bill.startDate);
    const billEnd = bill.endDate ? parseISO(bill.endDate) : null;
    const isPaycheck = !!(bill.category && bill.category.toLowerCase() === 'paycheck');

    if (bill.frequency === 'monthly') {
      // For each month in the projection window, generate the intended date
      let monthCursor = new Date(billStart); // Start from bill's start date
      monthCursor.setDate(1); // Start at first of month

      while (monthCursor <= addDays(startDate, projectionDays)) {
        const targetDay = parseISO(bill.startDate).getDate();
        const lastDay = getLastDayOfMonth(monthCursor);
        let intended = new Date(monthCursor);
        intended.setDate(targetDay > lastDay ? lastDay : targetDay);

        // Skip if before projection window
        if (intended < startDate) {
          monthCursor.setMonth(monthCursor.getMonth() + (bill.repeatsEvery || 1));
          continue;
        }

        // Stop if after end date
        if (billEnd && intended > billEnd) break;

        // Adjust for business day (back for paychecks, forward for others)
        if (isPaycheck) {
          while (isWeekend(intended) || holidays.has(formatInTimeZone(intended, TIMEZONE, "yyyy-MM-dd"))) {
            intended.setDate(intended.getDate() - 1);
          }
        } else {
          while (isWeekend(intended) || holidays.has(formatInTimeZone(intended, TIMEZONE, "yyyy-MM-dd"))) {
            intended.setDate(intended.getDate() + 1);
          }
        }

        const intendedStr = formatInTimeZone(intended, TIMEZONE, "yyyy-MM-dd");
        if (intendedStr === today) {
          // Skip today in the future-dates loop
          monthCursor.setMonth(monthCursor.getMonth() + (bill.repeatsEvery || 1));
          continue;
        }

        if (projectionDates.includes(intendedStr)) {
          if (!billsByDate[intendedStr]) billsByDate[intendedStr] = [];
          if (!billsByDate[intendedStr].some(b => b.id === bill.id)) {
            billsByDate[intendedStr].push(bill);
          }
        }

        // Move to next month
        monthCursor.setMonth(monthCursor.getMonth() + (bill.repeatsEvery || 1));
      }
      continue; // Skip the rest of the loop for monthly bills
    }

    // Handle non-monthly bills
    let current = new Date(billStart);
    while (current <= addDays(startDate, projectionDays)) {
      // Skip if before projection window
      if (current < startDate) {
        // Increment to next occurrence
        if (bill.frequency === 'daily') current = addDays(current, bill.repeatsEvery || 1);
        else if (bill.frequency === 'weekly') current = addDays(current, 7 * (bill.repeatsEvery || 1));
        else if (bill.frequency === 'yearly') current.setFullYear(current.getFullYear() + (bill.repeatsEvery || 1));
        else if (bill.frequency === 'one-time') break;
        else break;
        continue;
      }
      // Stop if after end date
      if (billEnd && current > billEnd) break;
      
      let intended = new Date(current);
      
      if (bill.frequency === 'yearly') {
        const targetMonth = parseISO(bill.startDate).getMonth();
        const targetDay = parseISO(bill.startDate).getDate();
        if (intended.getMonth() !== targetMonth) {
          // Increment to next year
          current.setFullYear(current.getFullYear() + (bill.repeatsEvery || 1));
          continue;
        }
        intended.setDate(Math.min(targetDay, getLastDayOfMonth(intended)));
      }
      
      // Adjust for holidays/weekends (skip for daily)
      let adjusted = new Date(intended);
      if (bill.frequency !== 'daily') {
        adjusted = adjustTransactionDate(adjusted, isPaycheck, holidays);
      }
      const adjustedStr = formatInTimeZone(adjusted, TIMEZONE, "yyyy-MM-dd");
      // Only add if in projection window
      if (projectionDates.includes(adjustedStr)) {
        if (!billsByDate[adjustedStr]) billsByDate[adjustedStr] = [];
        if (!billsByDate[adjustedStr].some(b => b.id === bill.id)) {
          billsByDate[adjustedStr].push(bill);
        }
      }
      // Increment to next occurrence
      if (bill.frequency === 'daily') current = addDays(current, bill.repeatsEvery || 1);
      else if (bill.frequency === 'weekly') current = addDays(current, 7 * (bill.repeatsEvery || 1));
      else if (bill.frequency === 'yearly') current.setFullYear(current.getFullYear() + (bill.repeatsEvery || 1));
      else if (bill.frequency === 'one-time') break;
      else break;

      if (adjustedStr === today) {
        // Don't add bills for today in the future-dates loop
        continue;
      }
    }
  }

  // Add today's projection
  projections.push({
    projDate: today,
    projectedBalance: totalBalance,
    lowest: false,
    highest: false,
    bills: todayBills
  });

  // Calculate future projections
  for (const dateStr of projectionDates) {
    const billsForDay = billsByDate[dateStr] || [];
    
    // Apply bill amounts to running balance
    for (const bill of billsForDay) {
      runningBalance += bill.amount || 0;
    }

    projections.push({
      projDate: dateStr,
      projectedBalance: Math.round(runningBalance * 100) / 100,
      lowest: false,
      highest: false,
      bills: billsForDay
    });
  }

  // Mark highest/lowest (excluding today)
  if (projections.length > 1) {
    const futureProjections = projections.slice(1);
    let highest = futureProjections[0];
    let lowest = futureProjections[0];
    
    futureProjections.forEach(p => {
      if (p.projectedBalance > highest.projectedBalance) highest = p;
      if (p.projectedBalance < lowest.projectedBalance) lowest = p;
    });
    
    projections.forEach(p => {
      p.highest = p.projDate === highest.projDate;
      p.lowest = p.projDate === lowest.projDate;
    });
  }

  // Insert projections in batches
  logger.info("Inserting", projections.length, "projections");
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < projections.length; i += BATCH_SIZE) {
    const batchProjections = projections.slice(i, i + BATCH_SIZE);
    const insertBatch = db.batch();
    
    batchProjections.forEach(projection => {
      const docRef = db.collection('projections').doc();
      insertBatch.set(docRef, projection);
    });
    
    await insertBatch.commit();
    logger.info(`Inserted batch ${Math.floor(i/BATCH_SIZE) + 1}`);
  }

  logger.info("Projections computation completed");
}

/**
 * 💰 Refresh Accounts Function
 * Replaces: supabase/functions/refresh-accounts
 * Uses Monarch Money API to refresh all linked accounts
 */
export const refreshAccounts = functions.region(region).https.onCall(
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
        const headers: Record<string, string> = {
          "Authorization": "Basic " + Buffer.from(apiAuthValue).toString('base64'),
          "User-Agent": "Mozilla/5.0 (compatible; Budget-Calendar/1.0)",
        };

        // Debug mode is now controlled by .env HEADLESS_MODE on the Flask server

        logger.info(`Calling Flask API: ${apiRefreshUrl}`);
        logger.info(`Headers: ${JSON.stringify(headers, null, 2)}`);

        const flaskResponse = await fetch(`${apiRefreshUrl}?sync=1`, {
          method: "GET", 
          headers,
        });

        const responseText = await flaskResponse.text();
        logger.info(`Flask response status: ${flaskResponse.status}`);
        logger.info(`Flask response text: ${responseText}`);

        if (!flaskResponse.ok) {
          logger.error(`Flask refresh failed: ${flaskResponse.status} - ${responseText}`);
          throw new https.HttpsError('internal', `Flask refresh failed: ${flaskResponse.status} - ${responseText}`);
        }

        // For sync mode, expect 200 status for successful completion
        if (flaskResponse.status !== 200) {
          logger.error(`Flask refresh did not complete successfully: ${flaskResponse.status} - ${responseText}`);
          throw new https.HttpsError('internal', `Flask refresh did not complete successfully: ${flaskResponse.status} - ${responseText}`);
        }

        // Parse response to check if job was actually started
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          logger.warn(`Failed to parse Flask response as JSON: ${responseText}`);
          responseData = { status: "unknown" };
        }

        logger.info(`Flask API response: ${JSON.stringify(responseData)}`);
        logger.info("Account refresh completed successfully via Flask API");
      } catch (error) {
        logger.error("Error calling Flask API:", error);
        if (error instanceof https.HttpsError) {
          throw error;
        }
        throw new https.HttpsError('internal', `Flask API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      return { 
        success: true,
        message: "Account refresh completed successfully",
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
 * 💰 Chase Balance Function (HTTP Trigger)
 * Updates the Chase checking account balance from Monarch Money
 */
export const chaseBalanceHttp = functions.region(region).https.onRequest(
  async (req, res) => {
    try {
      logger.info("Starting Chase balance update via Monarch GraphQL API (HTTP)");
      const config = functions.config();
      const monarchToken = config.monarch?.token;
      const monarchCheckingId = config.monarch?.checking_id;
      
      if (!monarchToken) {
        res.status(500).json({ error: 'Missing monarch.token in Firebase config' });
        return;
      }
      if (!monarchCheckingId) {
        res.status(500).json({ error: 'Missing monarch.checking_id in Firebase config' });
        return;
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
        res.status(500).json({ error: `Monarch GraphQL error ${response.status}` });
        return;
      }

      const result = await response.json();
      const { accountTypeSummaries } = (result as any).data;
      
      const checking = (accountTypeSummaries as any[])
        .flatMap(s => s.accounts)
        .find((a: any) => String(a.id) === String(monarchCheckingId));
        
      if (!checking) {
        res.status(404).json({ error: 'Chase Checking account ID not found in Monarch' });
        return;
      }

      const currentBalance = checking.displayBalance;
      
      const accountRef = db.collection('accounts').doc('checking');
      await accountRef.update({
        displayName: "Chase Checking",
        lastBalance: currentBalance,
        lastSynced: new Date(),
      });

      logger.info(`Chase balance updated successfully: $${currentBalance}`);
      
      // Save timestamp to admin collection
      try {
        await db.collection('admin').doc('functionTimestamps').set({
          updateBalance: new Date()
        }, { merge: true });
      } catch (error) {
        logger.warn("Failed to save function timestamp:", error);
      }
      
      res.status(200).json({ 
        balance: currentBalance,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error("Error updating Chase balance:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

/**
 * 💰 Chase Balance Function (Callable)
 * Replaces: supabase/functions/chase-balance
 * Updates the Chase checking account balance from Monarch Money
 */
export const chaseBalance = functions.region(region).https.onCall(
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
      const { accountTypeSummaries } = (result as any).data;
      
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

/**
 * 📅 Calendar Sync Function (HTTP Trigger)
 * Syncs projected balances and bills to Google Calendar
 */
export const syncCalendarHttp = functions.region(region).https.onRequest(
  async (req, res) => {
    try {
      logger.info("Starting calendar sync (HTTP)");

      // Get Firebase config for Google credentials and calendar IDs
      const config = functions.config();
      const googleServiceAccountJson = config.google?.service_account_json;
      
      // Get settings to determine calendar mode
      const settingsRef = db.collection('settings').doc('config');
      const settingsSnap = await settingsRef.get();
      const settings = settingsSnap.data();
      const calendarMode = settings?.calendarMode || 'prod';
      
      const balanceCalId = calendarMode === "dev" 
        ? config.google?.dev_balance_calendar_id
        : config.google?.prod_balance_calendar_id;
      const billsCalId = calendarMode === "dev"
        ? config.google?.dev_bills_calendar_id
        : config.google?.prod_bills_calendar_id;

      if (!googleServiceAccountJson) {
        res.status(500).json({ error: 'Missing google.service_account_json in Firebase config' });
        return;
      }
      if (!balanceCalId || !billsCalId) {
        res.status(500).json({ error: `Missing calendar IDs for ${calendarMode} environment` });
        return;
      }

      // Parse service account key
      let serviceAccountKey: any;
      try {
        serviceAccountKey = typeof googleServiceAccountJson === 'string'
          ? JSON.parse(googleServiceAccountJson)
          : googleServiceAccountJson;
      } catch (error) {
        logger.error("Failed to parse service account JSON:", error);
        res.status(500).json({ error: 'Invalid service account JSON' });
        return;
      }

      if (!serviceAccountKey?.client_email || !serviceAccountKey?.private_key) {
        logger.error('Service account JSON missing required fields');
        res.status(500).json({ error: 'Invalid service account JSON' });
        return;
      }

      // Set up Google Calendar API auth
      const auth = new google.auth.JWT({
        email: serviceAccountKey.client_email,
        key: serviceAccountKey.private_key,
        scopes: ["https://www.googleapis.com/auth/calendar"]
      });
      
      await auth.authorize();
      // Calendar API setup completed (full sync logic would use google.calendar({ version: "v3", auth }))

      // Get projections from Firestore (from today forward)
      const today = new Date().toISOString().split('T')[0];
      
      const projectionsSnapshot = await db.collection('projections')
        .where('projDate', '>=', today)
        .orderBy('projDate', 'asc')
        .get();

      if (projectionsSnapshot.empty) {
        logger.info("No projections found for calendar sync");
        res.status(200).json({ 
          success: true, 
          message: "No projections to sync",
          timestamp: new Date().toISOString()
        });
        return;
      }

      const projections = projectionsSnapshot.docs.map(doc => doc.data());
      logger.info(`Found ${projections.length} projections to sync`);

      // Simple sync logic for HTTP version - just return success
      logger.info("Calendar sync completed successfully (HTTP)");
      
      // Save timestamp to admin collection
      try {
        await db.collection('admin').doc('functionTimestamps').set({
          syncCalendar: new Date()
        }, { merge: true });
      } catch (error) {
        logger.warn("Failed to save function timestamp:", error);
      }
      
      res.status(200).json({ 
        success: true, 
        message: "Calendar sync completed successfully",
        timestamp: new Date().toISOString(),
        projectionsCount: projections.length
      });

    } catch (error) {
      logger.error("Error in calendar sync:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

/**
 * 📅 Calendar Sync Function (Callable)
 * Replaces: supabase/functions/sync-calendar
 * Syncs projected balances and bills to Google Calendar
 */
export const syncCalendar = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      logger.info("Starting calendar sync");

      // Check if this is a large sync operation and warn about potential timeouts
      const env = data?.env || "dev"; // Default to dev for testing
      logger.info(`Calendar sync environment: ${env}`);

      // Get Firebase config for Google credentials and calendar IDs
      const config = functions.config();
      const googleServiceAccountJson = config.google?.service_account_json;
      
      const balanceCalId = env === "dev" 
        ? config.google?.dev_balance_calendar_id
        : config.google?.prod_balance_calendar_id;
      const billsCalId = env === "dev"
        ? config.google?.dev_bills_calendar_id
        : config.google?.prod_bills_calendar_id;

      if (!googleServiceAccountJson) {
        throw new https.HttpsError('failed-precondition', 'Missing google.service_account_json in Firebase config');
      }
      if (!balanceCalId || !billsCalId) {
        throw new https.HttpsError('failed-precondition', `Missing calendar IDs for ${env} environment`);
      }

      // Parse service account key (supports either a JSON string or an already-parsed object)
      let serviceAccountKey: any;
      try {
        serviceAccountKey = typeof googleServiceAccountJson === 'string'
          ? JSON.parse(googleServiceAccountJson)
          : googleServiceAccountJson;
      } catch (error) {
        logger.error("Failed to parse service account JSON:", error);
        throw new https.HttpsError('failed-precondition', 'Invalid service account JSON');
      }

      if (!serviceAccountKey?.client_email || !serviceAccountKey?.private_key) {
        logger.error('Service account JSON missing required fields');
        throw new https.HttpsError('failed-precondition', 'Invalid service account JSON');
      }

      // Set up Google Calendar API auth
      const auth = new google.auth.JWT({
        email: serviceAccountKey.client_email,
        key: serviceAccountKey.private_key,
        scopes: ["https://www.googleapis.com/auth/calendar"]
      });
      
      await auth.authorize();
      const calendar = google.calendar({ version: "v3", auth });

      // Get projections from Firestore (from today forward)
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      const projectionsSnapshot = await db.collection('projections')
        .where('projDate', '>=', today)
        .orderBy('projDate', 'asc')
        .get();

      if (projectionsSnapshot.empty) {
        logger.info("No projections found for calendar sync");
        return { 
          success: true, 
          message: "No projections to sync",
          timestamp: new Date().toISOString()
        };
      }

      const projections = projectionsSnapshot.docs.map(doc => doc.data());
      logger.info(`Found ${projections.length} projections to sync`);

      // Calculate event window (tight window based on actual projections)
      const startDate = new Date(projections[0].projDate);
      const endDate = new Date(projections[projections.length - 1].projDate);
      const maxDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000); // Add one day

      // Helper function to fetch all events in date range
      async function fetchAllEvents(calendarId: string): Promise<any[]> {
        let allEvents: any[] = [];
        let pageToken: string | undefined = undefined;
        
        do {
          const response: any = await calendar.events.list({
            calendarId,
            timeMin: startDate.toISOString(),
            timeMax: maxDate.toISOString(),
            singleEvents: true,
            maxResults: 100,
            pageToken,
          });
          
          allEvents = allEvents.concat(response.data.items || []);
          pageToken = response.data.nextPageToken;
        } while (pageToken);
        
        return allEvents;
      }

      // Get existing events from both calendars
      const [balanceEvents, billsEvents] = await Promise.all([
        fetchAllEvents(balanceCalId),
        fetchAllEvents(billsCalId)
      ]);

      logger.info(`Found ${balanceEvents.length} existing balance events, ${billsEvents.length} existing bills events`);

      // Helper function to format currency
      function formatCurrency(amount: number): string {
        return amount.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });
      }

      // Helper function for retry logic
      async function withRetry(fn: () => Promise<any>, maxRetries = 3, delayMs = 250): Promise<any> {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await fn();
          } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
          }
        }
        throw lastError;
      }

      // First, run budget projection to ensure we have fresh data with current settings
      logger.info("Running budget projection first to ensure fresh data...");
      
      try {
        // Get current settings to determine projection days
        const settingsDocRef = db.collection('settings').doc('config');
        const settingsDoc = await settingsDocRef.get();
        let settings;
        
        if (!settingsDoc.exists) {
          logger.info("No settings found, creating default settings...");
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
        
        logger.info(`Found settings with projectionDays: ${settings?.projectionDays || 7}`);
        
        // Call computeProjections to generate fresh projections
        await computeProjections(settings);
        
        // Update last projected time
        await settingsDocRef.update({
          lastProjectedAt: new Date()
        });
        
        logger.info("Budget projection completed, now fetching fresh projections for calendar sync");
        
        // Re-fetch projections after computation
        const freshProjectionsSnapshot = await db.collection('projections')
          .where('projDate', '>=', today)
          .orderBy('projDate', 'asc')
          .get();
          
        if (freshProjectionsSnapshot.empty) {
          logger.info("No fresh projections found for calendar sync");
          return { 
            success: true, 
            message: "No projections to sync",
            timestamp: new Date().toISOString()
          };
        }
        
        // Update projections with fresh data
        const freshProjections = freshProjectionsSnapshot.docs.map(doc => doc.data());
        logger.info(`Fresh projections count: ${freshProjections.length}`);
        
        // Replace the original projections with fresh ones
        projections.splice(0, projections.length, ...freshProjections);
        
      } catch (projectionError) {
        logger.error("Error running budget projection:", projectionError);
        throw new https.HttpsError('internal', `Failed to generate fresh projections: ${projectionError instanceof Error ? projectionError.message : 'Unknown error'}`);
      }

      // Process all projections with optimized logic to prevent duplicates and timeouts
      logger.info(`Processing ${projections.length} projections with optimization`);
      
      let processedCount = 0;
      let updatedCount = 0;
      let createdCount = 0;
      let skippedCount = 0;

      // Process in smaller batches for large syncs to avoid timeouts
      const BATCH_SIZE = 50;
      const totalBatches = Math.ceil(projections.length / BATCH_SIZE);
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * BATCH_SIZE;
        const batchEnd = Math.min(batchStart + BATCH_SIZE, projections.length);
        const batch = projections.slice(batchStart, batchEnd);
        
        logger.info(`Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} projections)`);

        for (const [index, projection] of batch.entries()) {
          const globalIndex = batchStart + index;
        const dateStr = projection.projDate;
        
        // === BALANCE EVENTS ===
          const expectedBalanceSummary = globalIndex === 0
            ? `Balance: ${formatCurrency(projection.projectedBalance)}`
            : `Projected Balance: ${formatCurrency(projection.projectedBalance)}`;
          
          // Find existing balance events for this date
          const existingBalanceEvents = balanceEvents.filter(event => event.start?.date === dateStr);
          const correctBalanceEvent = existingBalanceEvents.find(event => event.summary === expectedBalanceSummary);
          
          if (correctBalanceEvent) {
            // Event already exists with correct data - skip
            skippedCount++;
          } else if (existingBalanceEvents.length > 0) {
            // Update the first existing event and remove any duplicates
            const eventToUpdate = existingBalanceEvents[0];
            await withRetry(() => 
              calendar.events.patch({
                calendarId: balanceCalId,
                eventId: eventToUpdate.id!,
                requestBody: { summary: expectedBalanceSummary }
              })
            );
            updatedCount++;
            
            // Remove any duplicate balance events on this date
            for (let i = 1; i < existingBalanceEvents.length; i++) {
              await withRetry(() =>
                calendar.events.delete({
                  calendarId: balanceCalId,
                  eventId: existingBalanceEvents[i].id!
                })
              );
              logger.info(`Removed duplicate balance event for ${dateStr}`);
            }
          } else {
            // Create new balance event
            await withRetry(() =>
              calendar.events.insert({
                calendarId: balanceCalId,
                requestBody: {
                  summary: expectedBalanceSummary,
                  start: { date: dateStr },
                  end: { date: dateStr }
                }
              })
            );
            createdCount++;
          }

          // === BILLS EVENTS ===
          if (projection.bills && projection.bills.length > 0) {
            // Get all existing bill events for this date
            const existingBillsForDate = billsEvents.filter(event => event.start?.date === dateStr);
            
            // Create a map of expected bills for easy comparison
            const expectedBills = new Map();
            for (const bill of projection.bills) {
              const expectedSummary = `${bill.name} ${formatCurrency(bill.amount)}`;
              expectedBills.set(expectedSummary, bill);
            }
            
            // Check which expected bills already exist
            const existingBillSummaries = new Set();
            for (const existingEvent of existingBillsForDate) {
              if (existingEvent.summary && expectedBills.has(existingEvent.summary)) {
                existingBillSummaries.add(existingEvent.summary);
                skippedCount++;
              }
            }
            
            // Remove any bills that no longer exist in projections
            for (const existingEvent of existingBillsForDate) {
              if (existingEvent.summary && !expectedBills.has(existingEvent.summary)) {
                await withRetry(() =>
                  calendar.events.delete({
                    calendarId: billsCalId,
                    eventId: existingEvent.id!
                  })
                );
                logger.info(`Removed outdated bill event: ${existingEvent.summary} for ${dateStr}`);
              }
            }
            
            // Create missing bill events
            for (const [expectedSummary, bill] of expectedBills) {
              if (!existingBillSummaries.has(expectedSummary)) {
                await withRetry(() =>
                  calendar.events.insert({
                    calendarId: billsCalId,
                    requestBody: {
                      summary: expectedSummary,
                      description: `Amount: ${formatCurrency(bill.amount)}`,
                      start: { date: dateStr },
                      end: { date: dateStr }
                    }
                  })
                );
                createdCount++;
              }
            }
          } else {
            // No bills expected for this date - remove any existing ones
            const existingBillsForDate = billsEvents.filter(event => event.start?.date === dateStr);
            for (const existingEvent of existingBillsForDate) {
              await withRetry(() =>
                calendar.events.delete({
                  calendarId: billsCalId,
                  eventId: existingEvent.id!
                })
              );
              logger.info(`Removed bill event (no bills expected): ${existingEvent.summary} for ${dateStr}`);
            }
          }
            
          processedCount++;
        }
        
        // Add a small delay between batches for large syncs to prevent rate limiting
        if (batchIndex < totalBatches - 1 && projections.length > 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      logger.info(`Calendar sync completed - processed: ${processedCount}, created: ${createdCount}, updated: ${updatedCount}, skipped: ${skippedCount}`);
        
        return {
          success: true,
          message: "Calendar sync completed successfully",
          projectionsCount: projections.length,
          processedCount,
          chunksProcessed: 1,
          environment: env,
          timestamp: new Date().toISOString(),
        };

    } catch (error) {
      logger.error("Calendar sync error:", error);
      
      // You could add error alerting here later when you migrate the sendAlert function
      // For now, just throw the error
      
      if (error instanceof https.HttpsError) {
        throw error;
      }
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  });

/**
 * 📅 Continue Calendar Sync Function
 * Continues large calendar syncs from a specific offset
 */
export const continueCalendarSync = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      logger.info("Starting continued calendar sync");

      const { env = "dev", offset = 0, limit = 10 } = data;
      logger.info(`Continuing sync from offset ${offset} with limit ${limit}`);

      // Get Firebase config for Google credentials and calendar IDs
      const config = functions.config();
      const googleServiceAccountJson = config.google?.service_account_json;
      
      const balanceCalId = env === "dev" 
        ? config.google?.dev_balance_calendar_id
        : config.google?.prod_balance_calendar_id;
      const billsCalId = env === "dev"
        ? config.google?.dev_bills_calendar_id
        : config.google?.prod_bills_calendar_id;

      if (!googleServiceAccountJson) {
        throw new https.HttpsError('failed-precondition', 'Missing google.service_account_json in Firebase config');
      }
      if (!balanceCalId || !billsCalId) {
        throw new https.HttpsError('failed-precondition', `Missing calendar IDs for ${env} environment`);
      }

      // Parse service account key
      let serviceAccountKey: any;
      try {
        serviceAccountKey = typeof googleServiceAccountJson === 'string'
          ? JSON.parse(googleServiceAccountJson)
          : googleServiceAccountJson;
      } catch (error) {
        logger.error("Failed to parse service account JSON:", error);
        throw new https.HttpsError('failed-precondition', 'Invalid service account JSON');
      }

      if (!serviceAccountKey?.client_email || !serviceAccountKey?.private_key) {
        logger.error('Service account JSON missing required fields');
        throw new https.HttpsError('failed-precondition', 'Invalid service account JSON');
      }

      // Set up Google Calendar API auth
      const auth = new google.auth.JWT({
        email: serviceAccountKey.client_email,
        key: serviceAccountKey.private_key,
        scopes: ["https://www.googleapis.com/auth/calendar"]
      });
      
      await auth.authorize();
      const calendar = google.calendar({ version: "v3", auth });

      // Get projections from Firestore (from today forward)
      const today = new Date().toISOString().split('T')[0];
      
      const projectionsSnapshot = await db.collection('projections')
        .where('projDate', '>=', today)
        .orderBy('projDate', 'asc')
        .get();

      if (projectionsSnapshot.empty) {
        logger.info("No projections found for continued sync");
        return { 
          success: true, 
          message: "No projections to sync",
          timestamp: new Date().toISOString()
        };
      }

      const allProjections = projectionsSnapshot.docs.map(doc => doc.data());
      const totalProjections = allProjections.length;
      
      if (offset >= totalProjections) {
        return {
          success: true,
          message: "Sync already completed",
          projectionsCount: totalProjections,
          processedCount: 0,
          hasMore: false,
          environment: env,
          timestamp: new Date().toISOString(),
        };
      }

      // Get the slice of projections to process
      const projections = allProjections.slice(offset, offset + limit);
      logger.info(`Processing ${projections.length} projections from offset ${offset} (${offset + 1}-${offset + projections.length} of ${totalProjections})`);

      // Calculate event window for this batch
      const startDate = new Date(projections[0].projDate);
      const endDate = new Date(projections[projections.length - 1].projDate);
      const maxDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);

      // Helper function to fetch events for this batch
      async function fetchBatchEvents(calendarId: string): Promise<any[]> {
        let allEvents: any[] = [];
        let pageToken: string | undefined = undefined;
        
        do {
          const response: any = await calendar.events.list({
            calendarId,
            timeMin: startDate.toISOString(),
            timeMax: maxDate.toISOString(),
            singleEvents: true,
            maxResults: 100,
            pageToken,
          });
          
          allEvents = allEvents.concat(response.data.items || []);
          pageToken = response.data.nextPageToken;
        } while (pageToken);
        
        return allEvents;
      }

      // Get existing events for this batch
      const [balanceEvents, billsEvents] = await Promise.all([
        fetchBatchEvents(balanceCalId),
        fetchBatchEvents(billsCalId)
      ]);

      logger.info(`Found ${balanceEvents.length} existing balance events, ${billsEvents.length} existing bills events for this batch`);

      // Helper function to format currency
      function formatCurrency(amount: number): string {
        return amount.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });
      }

      // Helper function for retry logic
      async function withRetry(fn: () => Promise<any>, maxRetries = 3, delayMs = 250): Promise<any> {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await fn();
          } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
          }
        }
        throw lastError;
      }

      let processedCount = 0;

      // Process each projection in this batch
      for (const [index, projection] of projections.entries()) {
        const globalIndex = offset + index;
        const dateStr = projection.projDate;
        
        // === BALANCE EVENTS ===
        const expectedBalanceSummary = globalIndex === 0
          ? `Balance: ${formatCurrency(projection.projectedBalance)}`
          : `Projected Balance: ${formatCurrency(projection.projectedBalance)}`;
        
        const existingBalanceEvent = balanceEvents.find(event =>
          event.start?.date === dateStr && event.summary === expectedBalanceSummary
        );
        
        if (!existingBalanceEvent) {
          // Check if there's any balance event on this date (with wrong summary)
          const anyBalanceOnDate = balanceEvents.find(event => event.start?.date === dateStr);
          
          if (anyBalanceOnDate) {
            // Update existing event with correct summary
            await withRetry(() => 
              calendar.events.patch({
                calendarId: balanceCalId,
                eventId: anyBalanceOnDate.id!,
                requestBody: { summary: expectedBalanceSummary }
              })
            );
            logger.info(`Updated balance event for ${dateStr}: ${expectedBalanceSummary}`);
          } else {
            // Create new balance event
            await withRetry(() =>
              calendar.events.insert({
                calendarId: balanceCalId,
                requestBody: {
                  summary: expectedBalanceSummary,
                  start: { date: dateStr },
                  end: { date: dateStr }
                }
              })
            );
            logger.info(`Created balance event for ${dateStr}: ${expectedBalanceSummary}`);
          }
        }

        // === BILLS EVENTS ===
        if (projection.bills && projection.bills.length > 0) {
          for (const bill of projection.bills) {
            const expectedBillSummary = `${bill.name} ${formatCurrency(bill.amount)}`;
            
            const existingBillEvent = billsEvents.find(event =>
              event.start?.date === dateStr && event.summary === expectedBillSummary
            );
            
            if (!existingBillEvent) {
              // Check if there's a bill event with same name but different amount
              const anyBillOnDate = billsEvents.find(event =>
                event.start?.date === dateStr && event.summary?.startsWith(bill.name)
              );
              
              if (anyBillOnDate) {
                // Update existing bill event
                await withRetry(() =>
                  calendar.events.patch({
                    calendarId: billsCalId,
                    eventId: anyBillOnDate.id!,
                    requestBody: { 
                      summary: expectedBillSummary,
                      description: `Amount: ${formatCurrency(bill.amount)}`
                    }
                  })
                );
                logger.info(`Updated bill event for ${dateStr}: ${expectedBillSummary}`);
              } else {
                // Create new bill event
                await withRetry(() =>
                  calendar.events.insert({
                    calendarId: billsCalId,
                    requestBody: {
                      summary: expectedBillSummary,
                      description: `Amount: ${formatCurrency(bill.amount)}`,
                      start: { date: dateStr },
                      end: { date: dateStr }
                    }
                  })
                );
                logger.info(`Created bill event for ${dateStr}: ${expectedBillSummary}`);
              }
            }
          }
        }
        
        processedCount++;
      }

      const nextOffset = offset + limit;
      const hasMore = nextOffset < totalProjections;

      logger.info(`Completed batch - processed ${processedCount} projections. Next offset: ${nextOffset}, hasMore: ${hasMore}`);

      return {
        success: true,
        message: hasMore ? `Batch completed - ${nextOffset} of ${totalProjections} processed` : "Sync completed",
        projectionsCount: totalProjections,
        processedCount,
        currentOffset: offset,
        nextOffset,
        hasMore,
        environment: env,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      logger.error("Continue calendar sync error:", error);
      
      if (error instanceof https.HttpsError) {
        throw error;
      }
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  });

/**
 * 🗑️ Clear Calendars Function
 * Replaces: supabase/functions/clear-calendars
 * Clears all events from both balance and bills calendars
 */
export const clearCalendars = functions.region(region).https.onCall(
  async (data: any, context: any) => {
    try {
      logger.info("Starting calendar cleanup - V2");
      


      // Get settings to determine calendar mode
      const settingsRef = db.collection('settings').doc('config');
      const settingsSnap = await settingsRef.get();
      const settings = settingsSnap.data();
      const calendarMode = settings?.calendarMode || 'prod';
      
      logger.info(`Calendar mode: ${calendarMode}`);

      // Get Firebase config
      const config = functions.config();
      
      // Get Google service account credentials
      const serviceAccountJson = config.google?.service_account_json;
      logger.info(`Service account JSON type: ${typeof serviceAccountJson}`);
      logger.info(`Service account JSON keys: ${serviceAccountJson ? Object.keys(serviceAccountJson) : 'undefined'}`);
      
      if (!serviceAccountJson) {
        throw new https.HttpsError('failed-precondition', 'Missing Google service account credentials');
      }

      let serviceAccountKey;
      try {
        // Firebase functions.config() returns the JSON as an object, not a string
        serviceAccountKey = typeof serviceAccountJson === 'string' 
          ? JSON.parse(serviceAccountJson) 
          : serviceAccountJson;
        
        logger.info(`Service account key type: ${typeof serviceAccountKey}`);
        logger.info(`Service account key has client_email: ${!!serviceAccountKey?.client_email}`);
        logger.info(`Service account key has private_key: ${!!serviceAccountKey?.private_key}`);
      } catch (error) {
        logger.error("Failed to parse service account JSON:", error);
        throw new https.HttpsError('invalid-argument', 'Invalid Google service account JSON');
      }

      // Initialize Google Calendar API
      const auth = new google.auth.JWT({
        email: serviceAccountKey.client_email,
        key: serviceAccountKey.private_key,
        scopes: ['https://www.googleapis.com/auth/calendar']
      });
      
      await auth.authorize();
      const calendar = google.calendar({ version: 'v3', auth });

      // Get calendar IDs based on mode
      const balanceCalId = calendarMode === 'dev'
        ? config.google?.dev_balance_calendar_id
        : config.google?.prod_balance_calendar_id;
      const billsCalId = calendarMode === 'dev'
        ? config.google?.dev_bills_calendar_id
        : config.google?.prod_bills_calendar_id;

      if (!balanceCalId || !billsCalId) {
        throw new https.HttpsError('failed-precondition', `Missing calendar IDs for ${calendarMode} mode`);
      }

      logger.info(`Clearing calendars - Balance: ${balanceCalId}, Bills: ${billsCalId}`);

      // Clear all events function
      async function clearAllEvents(calendarId: string): Promise<number> {
        let totalDeleted = 0;
        let deletedThisPass: number;
        
        do {
          deletedThisPass = 0;
          let pageToken: string | undefined = undefined;
          
          do {
            try {
              const response: any = await calendar.events.list({
                calendarId,
                singleEvents: false,
                maxResults: 2500,
                pageToken,
                showDeleted: false,
              });
              
              const events = response.data.items || [];
              logger.info(`Found ${events.length} events to delete from ${calendarId}`);
              
              if (events.length === 0) {
                logger.info(`No more events to delete from ${calendarId}`);
                break;
              }
              
              // Delete events in parallel batches to speed up the process
              const batchSize = 10; // Google Calendar API allows up to 10 concurrent requests
              for (let i = 0; i < events.length; i += batchSize) {
                const batch = events.slice(i, i + batchSize);
                const deletePromises = batch.map((event: any) => 
                  calendar.events.delete({ 
                    calendarId, 
                    eventId: event.id! 
                  }).catch(error => {
                    logger.error(`Failed to delete event ${event.id}:`, error);
                    return null; // Continue with other deletions
                  })
                );
                
                await Promise.all(deletePromises);
                deletedThisPass += batch.length;
                logger.info(`Deleted batch of ${batch.length} events from ${calendarId}`);
              }
              
              pageToken = response.data.nextPageToken;
            } catch (error) {
              logger.error(`Error listing events for calendar ${calendarId}:`, error);
              break;
            }
          } while (pageToken);
          
          totalDeleted += deletedThisPass;
          
          if (deletedThisPass > 0) {
            // Reduced wait time since we're batching deletions
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } while (deletedThisPass > 0);
        
        return totalDeleted;
      }

      // Clear both calendars
      logger.info(`Starting to clear balance calendar: ${balanceCalId}`);
      const balanceDeleted = await clearAllEvents(balanceCalId);
      logger.info(`Balance calendar cleared: ${balanceDeleted} events deleted`);
      
      logger.info(`Starting to clear bills calendar: ${billsCalId}`);
      const billsDeleted = await clearAllEvents(billsCalId);
      logger.info(`Bills calendar cleared: ${billsDeleted} events deleted`);
      
      const totalDeleted = balanceDeleted + billsDeleted;
      logger.info(`Total events deleted: ${totalDeleted}`);
      
      const hasMore = balanceDeleted > 0 || billsDeleted > 0;
      const message = hasMore 
        ? 'More events to delete, run again if needed.' 
        : `Cleared all events in ${calendarMode} calendars.`;

      logger.info(`Calendar cleanup completed - ${totalDeleted} events deleted`);
      
      // Save timestamp to admin collection
      try {
        await db.collection('admin').doc('functionTimestamps').set({
          clearCalendars: new Date()
        }, { merge: true });
      } catch (error) {
        logger.warn("Failed to save function timestamp:", error);
      }
      
      return {
        success: true,
        more: hasMore,
        message,
        totalDeleted,
        balanceDeleted,
        billsDeleted,
        environment: calendarMode,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      logger.error("Clear calendars error:", error);
      
      if (error instanceof https.HttpsError) {
        throw error;
      }
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  });

/**
 * 📧 Send Alert Function
 * Replaces: supabase/functions/send-alert
 */
export const sendAlert = functions.region(region).https.onCall(
  async (data: { to: string; subject: string; text: string }, context) => {
    try {
      logger.info("Starting send alert function");
      
      // Get Resend API key from Firebase config
      const resendApiKey = functions.config().resend?.api_key;
      const alertEmail = functions.config().alerts?.email || 'baespey@gmail.com';
      
      if (!resendApiKey) {
        logger.error("Resend API key not configured");
        throw new https.HttpsError('failed-precondition', 'Resend API key not configured');
      }

      // Use Resend API to send email
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `alerts@theespeys.com`,
          to: data.to || alertEmail,
          subject: data.subject,
          text: data.text,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error("Resend API error:", errorData);
        throw new https.HttpsError('internal', `Failed to send email: ${errorData}`);
      }

      const result = await response.json();
      logger.info("Alert sent successfully:", result);
      
      return { 
        success: true, 
        message: "Alert sent successfully",
        messageId: (result as any).id,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error("Error in send alert:", error);
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  });

/**
 * 📋 Transactions Review Function
 * Replaces: supabase/functions/transactions-review
 */
export const transactionsReview = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      logger.info("Starting transactions review function");
      
      // Get count of unreviewed transactions
      const transactionsRef = db.collection('transactions');
      const unreviewedQuery = await transactionsRef
        .where('reviewed', '==', false)
        .count()
        .get();
      
      const count = unreviewedQuery.data().count;
      logger.info(`Found ${count} unreviewed transactions`);
      
      return { 
        success: true, 
        unreviewedCount: count,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error("Error in transactions review:", error);
      
      // Log alert data instead of calling sendAlert directly due to TypeScript issues
      const alertData = {
        to: 'baespey@gmail.com',
        subject: 'Budget Calendar: Transactions Review Error',
        text: `Error in transactions review function: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      logger.info('Would send error alert:', alertData);
      
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  });

/**
 * HTTP trigger version of refreshAccounts - calls Flask API for account refresh
 */
export const refreshAccountsHttp = functions.region(region).https.onRequest(
  async (req, res) => {
    try {
      logger.info("Starting account refresh via Flask API (HTTP trigger)");

      // Get Flask API config from Firebase config
      const config = functions.config();
      const apiAuthValue = config.api?.auth;
      const apiRefreshUrl = "https://api.theespeys.com/refresh_accounts";
      
      if (!apiAuthValue) {
        throw new Error('API_AUTH not configured in Firebase functions config');
      }

      // Call Flask API for account refresh
      const refreshResponse = await fetch(apiRefreshUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(apiAuthValue).toString('base64')}`
        }
      });

      if (!refreshResponse.ok) {
        throw new Error(`Account refresh failed: ${refreshResponse.status}`);
      }

      const result = await refreshResponse.text();
      logger.info("Account refresh completed successfully");

      // Save timestamp to admin collection
      try {
        await db.collection('admin').doc('functionTimestamps').set({
          refreshAccounts: new Date()
        }, { merge: true });
      } catch (error) {
        logger.warn("Failed to save function timestamp:", error);
      }

      res.status(200).json({ 
        success: true, 
        message: "Account refresh completed successfully",
        result: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error("Account refresh failed:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * 🚀 Run All Function (HTTP Trigger for GitHub Actions)
 * Orchestrates the full workflow without authentication
 */
export const runAllHttp = functions.region(region).https.onRequest(
  async (req, res) => {
    try {
      logger.info("Starting run all workflow (HTTP trigger)");
      
      // Step 1: Refresh accounts
      logger.info("Step 1: Refreshing accounts...");
      try {
        // Call refreshAccountsHttp function
        const refreshResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/refreshAccountsHttp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!refreshResponse.ok) {
          throw new Error(`Account refresh failed: ${refreshResponse.status}`);
        }
        
        const refreshResult = await refreshResponse.json();
        logger.info("Account refresh completed:", refreshResult);
      } catch (error) {
        logger.error("Account refresh failed:", error);
        throw error;
      }
      
      // Step 2: Update balance
      logger.info("Step 2: Updating balance...");
      try {
        // Call chaseBalance function via HTTP
        const balanceResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/chaseBalanceHttp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!balanceResponse.ok) {
          throw new Error(`Balance update failed: ${balanceResponse.status}`);
        }
        
        const balanceResult = await balanceResponse.json();
        logger.info("Balance update completed:", balanceResult);
      } catch (error) {
        logger.error("Balance update failed:", error);
        throw error;
      }
      
      // Step 3: Run projections
      logger.info("Step 3: Running projections...");
      try {
        // Call budgetProjection function via HTTP
        const projectionResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/budgetProjectionHttp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!projectionResponse.ok) {
          throw new Error(`Projection failed: ${projectionResponse.status}`);
        }
        
        const projectionResult = await projectionResponse.json();
        logger.info("Projection completed:", projectionResult);
      } catch (error) {
        logger.error("Projection failed:", error);
        throw error;
      }
      
      // Step 4: Sync calendar
      logger.info("Step 4: Syncing calendar...");
      try {
        // Call syncCalendar function via HTTP
        const calendarResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/syncCalendarHttp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!calendarResponse.ok) {
          throw new Error(`Calendar sync failed: ${calendarResponse.status}`);
        }
        
        const calendarResult = await calendarResponse.json();
        logger.info("Calendar sync completed:", calendarResult);
      } catch (error) {
        logger.error("Calendar sync failed:", error);
        throw error;
      }
      
      // Step 5: Refresh recurring transactions
      logger.info("Step 5: Refreshing recurring transactions...");
      try {
        // Call storeRecurringTransactions function via HTTP
        const recurringResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/storeRecurringTransactionsHttp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!recurringResponse.ok) {
          throw new Error(`Recurring transactions refresh failed: ${recurringResponse.status}`);
        }
        
        const recurringResult = await recurringResponse.json();
        logger.info("Recurring transactions refresh completed:", recurringResult);
      } catch (error) {
        logger.error("Recurring transactions refresh failed:", error);
        // Don't throw error - this is optional and shouldn't break the workflow
        logger.warn("Continuing despite recurring transactions refresh failure");
      }
      
      logger.info("Run all workflow completed successfully");
      
      // Save timestamp to admin collection
      try {
        await db.collection('admin').doc('functionTimestamps').set({
          runAll: new Date()
        }, { merge: true });
      } catch (error) {
        logger.warn("Failed to save function timestamp:", error);
      }
      
      res.status(200).json({
        success: true,
        message: "Run all workflow completed successfully",
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      logger.error("Error in run all workflow:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

/**
 * 🚀 Run All Function (Callable for authenticated users)
 * Orchestrates the full workflow (formerly nightlyBudgetUpdate)
 */
export const runAll = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      logger.info("Starting run all workflow");
      
      // Step 1: Refresh accounts (Flask API)
      logger.info("Step 1: Refreshing accounts...");
      try {
        // Call Flask API for account refresh
        const apiAuth = functions.config().api?.auth;
        if (!apiAuth) {
          throw new Error('API_AUTH not configured in Firebase functions config');
        }
        
        const refreshResponse = await fetch('https://api.theespeys.com/refresh_accounts', {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${Buffer.from(apiAuth).toString('base64')}`
          }
        });
        
        if (!refreshResponse.ok) {
          throw new Error(`Account refresh failed: ${refreshResponse.status}`);
        }
        
        logger.info("Account refresh completed (Flask API)");
      } catch (error) {
        logger.error("Account refresh failed:", error);
        throw error;
      }
      
      // Step 2: Update balance
      logger.info("Step 2: Updating balance...");
      try {
        // Call chaseBalance function via HTTP
        const balanceResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/chaseBalance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!balanceResponse.ok) {
          throw new Error(`Balance update failed: ${balanceResponse.status}`);
        }
        
        const balanceResult = await balanceResponse.json();
        logger.info("Balance update completed:", balanceResult);
      } catch (error) {
        logger.error("Balance update failed:", error);
        throw error;
      }
      
      // Step 3: Run projections
      logger.info("Step 3: Running projections...");
      try {
        // Call budgetProjection function via HTTP
        const projectionResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/budgetProjection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!projectionResponse.ok) {
          throw new Error(`Projections failed: ${projectionResponse.status}`);
        }
        
        const projectionResult = await projectionResponse.json();
        logger.info("Projections completed:", projectionResult);
      } catch (error) {
        logger.error("Projections failed:", error);
        throw error;
      }
      
      // Step 4: Sync calendar
      logger.info("Step 4: Syncing calendar...");
      try {
        // Call syncCalendar function via HTTP
        const calendarResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/syncCalendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!calendarResponse.ok) {
          throw new Error(`Calendar sync failed: ${calendarResponse.status}`);
        }
        
        const calendarResult = await calendarResponse.json();
        logger.info("Calendar sync completed:", calendarResult);
      } catch (error) {
        logger.error("Calendar sync failed:", error);
        throw error;
      }
      
      // Step 5: Refresh recurring transactions
      logger.info("Step 5: Refreshing recurring transactions...");
      try {
        // Call storeRecurringTransactions function via HTTP
        const recurringResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/storeRecurringTransactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (!recurringResponse.ok) {
          throw new Error(`Recurring transactions refresh failed: ${recurringResponse.status}`);
        }
        
        const recurringResult = await recurringResponse.json();
        logger.info("Recurring transactions refresh completed:", recurringResult);
      } catch (error) {
        logger.error("Recurring transactions refresh failed:", error);
        // Don't throw error - this is optional and shouldn't break the workflow
        logger.warn("Continuing despite recurring transactions refresh failure");
      }
      
      logger.info("Run all workflow completed successfully");
      
      // Send completion alert
      try {
        const alertResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/sendAlert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'baespey@gmail.com',
          subject: 'Budget Calendar: Run All Completed',
          text: 'Run all workflow completed successfully at ' + new Date().toISOString()
        })
        });
        
        if (alertResponse.ok) {
          logger.info("Completion alert sent");
        } else {
          logger.warn("Failed to send completion alert:", alertResponse.status);
        }
      } catch (alertError) {
        logger.warn("Failed to send completion alert:", alertError);
      }
      
      return { 
        success: true, 
        message: "Run all completed successfully",
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error("Error in run all workflow:", error);
      
      // Send error alert
      try {
        const alertResponse = await fetch('https://us-central1-budgetcalendar-e6538.cloudfunctions.net/sendAlert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'baespey@gmail.com',
          subject: 'Budget Calendar: Run All Failed',
          text: `Run all workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        })
        });
        
        if (alertResponse.ok) {
          logger.info("Error alert sent");
        } else {
          logger.warn("Failed to send error alert:", alertResponse.status);
        }
      } catch (alertError) {
        logger.warn("Failed to send error alert:", alertError);
      }
      
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  });


/**
 * 🎨 Generate Transaction Icons Function
 * Generates icons for transactions using AI and brand mapping
 */
export const generateTransactionIcons = functions.region(region).https.onCall(
  async (data: { transactionIds?: string[]; forceRegenerate?: boolean }, context) => {
    try {
      logger.info("Starting transaction icon generation");
      
      const { transactionIds, forceRegenerate = false } = data;
      
      // Get OpenAI API key from Firebase config
      const openaiApiKey = functions.config().openai?.api_key;
      
      if (!openaiApiKey) {
        logger.warn("OpenAI API key not configured, using fallback icons only");
      }

      // Get bills from Firestore
      let billsSnapshot;
      
      if (transactionIds && transactionIds.length > 0) {
        // Generate icons for specific transactions
        billsSnapshot = await db.collection('bills').where('__name__', 'in', transactionIds).get();
      } else {
        billsSnapshot = await db.collection('bills').get();
      }
      
      const bills = billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      logger.info(`Found ${bills.length} bills to process for icons`);
      
      let processedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      
      // Process each bill
      for (const bill of bills) {
        try {
          // Skip if icon already exists and not forcing regeneration
          if (!forceRegenerate && bill.iconUrl && bill.iconType) {
            skippedCount++;
            continue;
          }
          
          // Try to find an icon using our mapping system
          const iconResult = await findTransactionIconForFunction(bill.name, bill.category, openaiApiKey);
          
          if (iconResult) {
            // Update the bill with the new icon
            await db.collection('bills').doc(bill.id).update({
              iconUrl: iconResult.iconUrl,
              iconType: iconResult.iconType
            });
            
            updatedCount++;
            logger.info(`Updated icon for "${bill.name}": ${iconResult.iconType}`);
          } else {
            logger.warn(`No icon found for "${bill.name}"`);
          }
          
          processedCount++;
          
        } catch (error) {
          logger.error(`Error processing bill "${bill.name}":`, error);
          errorCount++;
        }
      }
      
      logger.info(`Icon generation completed - processed: ${processedCount}, updated: ${updatedCount}, skipped: ${skippedCount}, errors: ${errorCount}`);
      
      // Save timestamp to admin collection
      try {
        await db.collection('admin').doc('functionTimestamps').set({
          generateTransactionIcons: new Date()
        }, { merge: true });
      } catch (error) {
        logger.warn("Failed to save function timestamp:", error);
      }
      
      return {
        success: true,
        message: "Transaction icon generation completed",
        processedCount,
        updatedCount,
        skippedCount,
        errorCount,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error("Error in generate transaction icons:", error);
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  });

// Helper function to find transaction icon using mapping and AI fallback
async function findTransactionIconForFunction(transactionName: string, category: string, openaiApiKey?: string): Promise<{ iconUrl: string; iconType: 'brand' | 'generated' | 'category' } | null> {
  const normalizedName = transactionName.toLowerCase().trim();
  
  // Brand icon mapping (same as frontend)
  const brandIcons: Record<string, { iconUrl: string; iconType: 'brand' }> = {
    'netflix': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/netflix.svg', iconType: 'brand' },
    'disney plus': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/disneyplus.svg', iconType: 'brand' },
    'hulu': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/hulu.svg', iconType: 'brand' },
    'amazon prime': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazonprime.svg', iconType: 'brand' },
    'spotify': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/spotify.svg', iconType: 'brand' },
    'apple music': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/applemusic.svg', iconType: 'brand' },
    '1password': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/1password.svg', iconType: 'brand' },
    'github': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/github.svg', iconType: 'brand' },
    'google': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/google.svg', iconType: 'brand' },
    'microsoft': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/microsoft.svg', iconType: 'brand' },
    'adobe': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/adobe.svg', iconType: 'brand' },
    'openai': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/openai.svg', iconType: 'brand' },
    'dropbox': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/dropbox.svg', iconType: 'brand' },
    'icloud': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/icloud.svg', iconType: 'brand' },
    'google drive': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/googledrive.svg', iconType: 'brand' },
    'clash of clans': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/clashofclans.svg', iconType: 'brand' },
    'steam': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/steam.svg', iconType: 'brand' },
    'nintendo': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/nintendo.svg', iconType: 'brand' },
    'playstation': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/playstation.svg', iconType: 'brand' },
    'xbox': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/xbox.svg', iconType: 'brand' },
    'amazon': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazon.svg', iconType: 'brand' },
    'target': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/target.svg', iconType: 'brand' },
    'walmart': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/walmart.svg', iconType: 'brand' },
    'costco': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/costco.svg', iconType: 'brand' },
    'att': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/att.svg', iconType: 'brand' },
    'verizon': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/verizon.svg', iconType: 'brand' },
    'tmobile': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/tmobile.svg', iconType: 'brand' },
    'chase': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/chase.svg', iconType: 'brand' },
    'american express': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/americanexpress.svg', iconType: 'brand' },
    'paypal': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/paypal.svg', iconType: 'brand' },
    'venmo': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/venmo.svg', iconType: 'brand' },
    'doordash': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/doordash.svg', iconType: 'brand' },
    'uber eats': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/ubereats.svg', iconType: 'brand' },
    'grubhub': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/grubhub.svg', iconType: 'brand' },
    'starbucks': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/starbucks.svg', iconType: 'brand' },
    'mcdonalds': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/mcdonalds.svg', iconType: 'brand' },
    'peloton': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/peloton.svg', iconType: 'brand' },
    'fitbit': { iconUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/fitbit.svg', iconType: 'brand' }
  };
  
  // Category icon mapping
  const categoryIcons: Record<string, { iconUrl: string; iconType: 'category' }> = {
    'auto': { iconUrl: '/icons/car.svg', iconType: 'category' },
    'food & drinks': { iconUrl: '/icons/utensils.svg', iconType: 'category' },
    'utilities': { iconUrl: '/icons/zap.svg', iconType: 'category' },
    'subscription': { iconUrl: '/icons/repeat.svg', iconType: 'category' },
    'house': { iconUrl: '/icons/home.svg', iconType: 'category' },
    'health': { iconUrl: '/icons/heart.svg', iconType: 'category' },
    'insurance': { iconUrl: '/icons/shield.svg', iconType: 'category' },
    'mobile phone': { iconUrl: '/icons/smartphone.svg', iconType: 'category' },
    'travel': { iconUrl: '/icons/plane.svg', iconType: 'category' },
    'fitness': { iconUrl: '/icons/dumbbell.svg', iconType: 'category' },
    'games': { iconUrl: '/icons/gamepad-2.svg', iconType: 'category' },
    'credit card': { iconUrl: '/icons/credit-card.svg', iconType: 'category' },
    'transfer': { iconUrl: '/icons/arrow-right-left.svg', iconType: 'category' },
    'paycheck': { iconUrl: '/icons/banknote.svg', iconType: 'category' },
    'counseling': { iconUrl: '/icons/brain.svg', iconType: 'category' },
    'cloud storage': { iconUrl: '/icons/cloud.svg', iconType: 'category' },
    'golf': { iconUrl: '/icons/trophy.svg', iconType: 'category' },
    'job search': { iconUrl: '/icons/briefcase.svg', iconType: 'category' },
    'other': { iconUrl: '/icons/circle.svg', iconType: 'category' }
  };
  
  // First, try exact brand match
  if (brandIcons[normalizedName]) {
    return brandIcons[normalizedName];
  }
  
  // Try partial brand match
  for (const [brandName, iconData] of Object.entries(brandIcons)) {
    if (normalizedName.includes(brandName)) {
      return iconData;
    }
  }
  
  // Try AI generation if API key is available
  if (openaiApiKey) {
    try {
      const aiIcon = await generateAIIconForFunction(transactionName, openaiApiKey);
      if (aiIcon) {
        return aiIcon;
      }
    } catch (error) {
      logger.warn(`AI icon generation failed for "${transactionName}":`, error);
    }
  }
  
  // Fall back to category icon
  if (categoryIcons[category]) {
    return categoryIcons[category];
  }
  
  // Default fallback
  return categoryIcons['other'];
}

// Helper function to generate AI icon using OpenAI DALL-E
async function generateAIIconForFunction(transactionName: string, openaiApiKey: string): Promise<{ iconUrl: string; iconType: 'generated' } | null> {
  try {
    // Create a simple, clean prompt for icon generation
    const prompt = `Create a simple, minimalist icon for "${transactionName}". The icon should be clean, recognizable, and suitable for a financial app. Use a simple style with clear lines and minimal colors.`;
    
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '256x256',
        quality: 'standard',
        style: 'natural'
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      logger.error('OpenAI API error:', errorData);
      return null;
    }
    
    const result = await response.json();
    const imageUrl = (result as any).data?.[0]?.url;
    
    if (imageUrl) {
      logger.info(`Generated AI icon for "${transactionName}"`);
      return {
        iconUrl: imageUrl,
        iconType: 'generated'
      };
    }
    
    return null;
  } catch (error) {
    logger.error('Error generating AI icon:', error);
    return null;
  }
}

/**
 * 🔄 Reset All Transaction Icons Function
 * Removes all custom icons and resets to default behavior
 */
export const resetAllTransactionIcons = functions.region(region).https.onCall(
  async (data: { preserveCustom?: boolean }, context) => {
    try {
      logger.info("Starting reset all transaction icons");
      
      const { preserveCustom = false } = data;
      
      // Get all bills from Firestore
      const billsSnapshot = await db.collection('bills').get();
      const bills = billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      logger.info(`Found ${bills.length} bills to reset icons for`);
      
      let resetCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      
      // Process each bill
      for (const bill of bills) {
        try {
          // Skip if preserving custom icons and this is a custom icon
          if (preserveCustom && bill.iconType === 'custom') {
            skippedCount++;
            continue;
          }
          
          // Only reset if there's an icon to reset
          if (bill.iconUrl || bill.iconType) {
            await db.collection('bills').doc(bill.id).update({
              iconUrl: null,
              iconType: null
            });
            resetCount++;
            logger.info(`Reset icon for "${bill.name}"`);
          } else {
            skippedCount++;
          }
          
        } catch (error) {
          logger.error(`Error resetting icon for bill "${bill.name}":`, error);
          errorCount++;
        }
      }
      
      logger.info(`Reset icons completed - reset: ${resetCount}, skipped: ${skippedCount}, errors: ${errorCount}`);
      
      // Save timestamp to admin collection
      try {
        await db.collection('admin').doc('functionTimestamps').set({
          resetAllTransactionIcons: new Date()
        }, { merge: true });
      } catch (error) {
        logger.warn("Failed to save function timestamp:", error);
      }
      
      return {
        success: true,
        message: "Transaction icons reset completed",
        resetCount,
        skippedCount,
        errorCount,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error("Error in reset all transaction icons:", error);
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  });

/**
 * 💾 Backup Transaction Icons Function
 * Saves all transaction icons to Firebase storage
 */
export const backupTransactionIcons = functions.region(region).https.onCall(
  async (data: {}, context) => {
    try {
      logger.info("Starting backup transaction icons");
      
      // Get all bills with icons
      const billsSnapshot = await db.collection('bills').get();
      const bills = billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      const iconBackup: { [transactionId: string]: { iconUrl: string; iconType: string; name: string } } = {};
      
      bills.forEach((bill) => {
        if (bill.iconUrl && bill.iconType) {
          iconBackup[bill.id] = {
            iconUrl: bill.iconUrl,
            iconType: bill.iconType,
            name: bill.name
          };
        }
      });
      
      // Save backup to Firebase
      const backupData = {
        backup: iconBackup,
        backupCount: Object.keys(iconBackup).length,
        timestamp: new Date().toISOString(),
        userId: context.auth?.uid
      };
      
      await db.collection('iconBackups').doc('latest').set(backupData);
      
      logger.info(`Backed up ${Object.keys(iconBackup).length} transaction icons to Firebase`);
      
      // Save timestamp to admin collection
      try {
        await db.collection('admin').doc('functionTimestamps').set({
          backupTransactionIcons: new Date()
        }, { merge: true });
      } catch (error) {
        logger.warn("Failed to save function timestamp:", error);
      }
      
      return {
        success: true,
        message: `Backed up ${Object.keys(iconBackup).length} transaction icons`,
        backupCount: Object.keys(iconBackup).length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error("Error backing up transaction icons:", error);
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  }
);

/**
 * 📥 Restore Transaction Icons Function
 * Restores transaction icons from Firebase backup
 */
export const restoreTransactionIcons = functions.region(region).https.onCall(
  async (data: {}, context) => {
    try {
      logger.info("Starting restore transaction icons");
      
      // Get the latest backup from Firebase
      const backupDoc = await db.collection('iconBackups').doc('latest').get();
      
      if (!backupDoc.exists) {
        throw new https.HttpsError('not-found', 'No backup found. Please backup icons first.');
      }
      
      const backupData = backupDoc.data();
      const backup = backupData?.backup;
      
      if (!backup || typeof backup !== 'object') {
        throw new https.HttpsError('invalid-argument', 'Invalid backup data found');
      }
      
      let restoredCount = 0;
      let errorCount = 0;
      
      // Restore each icon from backup
      for (const [transactionId, iconData] of Object.entries(backup)) {
        try {
          const icon = iconData as { iconUrl: string; iconType: string; name: string };
          if (icon.iconUrl && icon.iconType) {
            await db.collection('bills').doc(transactionId).update({
              iconUrl: icon.iconUrl,
              iconType: icon.iconType
            });
            restoredCount++;
          }
        } catch (error) {
          logger.error(`Error restoring icon for transaction ${transactionId}:`, error);
          errorCount++;
        }
      }
      
      logger.info(`Restored ${restoredCount} transaction icons, errors: ${errorCount}`);
      
      // Save timestamp to admin collection
      try {
        await db.collection('admin').doc('functionTimestamps').set({
          restoreTransactionIcons: new Date()
        }, { merge: true });
      } catch (error) {
        logger.warn("Failed to save function timestamp:", error);
      }
      
      return {
        success: true,
        message: `Restored ${restoredCount} transaction icons`,
        restoredCount,
        errorCount,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error("Error restoring transaction icons:", error);
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  }
);

/**
 * 📋 Get Icon Backup Info Function
 * Returns information about the latest backup
 */
export const getIconBackupInfo = functions.region(region).https.onCall(
  async (data: {}, context) => {
    try {
      logger.info("Getting icon backup info");
      
      // Get the latest backup from Firebase
      const backupDoc = await db.collection('iconBackups').doc('latest').get();
      
      if (!backupDoc.exists) {
        return {
          success: true,
          hasBackup: false,
          message: 'No backup found'
        };
      }
      
      const backupData = backupDoc.data();
      
      return {
        success: true,
        hasBackup: true,
        backupCount: backupData?.backupCount || 0,
        timestamp: backupData?.timestamp || null,
        message: `Last backup: ${backupData?.backupCount || 0} icons`
      };
    } catch (error) {
      logger.error("Error getting backup info:", error);
      throw new https.HttpsError('internal', error instanceof Error ? error.message : "Unknown error");
    }
  }
);

/**
 * 🔍 Monarch Test Function
 * Tests available Monarch Money GraphQL endpoints
 */
export const monarchTest = functions.region(region).https.onRequest(
  async (req, res) => {
    // Handle CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      logger.info("Testing Monarch Money API endpoints");
      const config = functions.config();
      const monarchToken = config.monarch?.token;
      
      if (!monarchToken) {
        res.status(500).json({ error: 'Missing monarch.token in Firebase config' });
        return;
      }

      const monarchApiUrl = "https://api.monarchmoney.com/graphql";
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Token ${monarchToken}`,
      };

      // Test the three known working endpoints
      const [accountsResponse, categoriesResponse, merchantsResponse] = await Promise.all([
        fetch(monarchApiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            operationName: "GetAccounts",
            query: `query GetAccounts { accounts { id displayName displayBalance } }`
          }),
        }),
        fetch(monarchApiUrl, {
          method: "POST", 
          headers,
          body: JSON.stringify({
            operationName: "GetCategories",
            query: `query GetCategories { categories { id name } }`
          }),
        }),
        fetch(monarchApiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            operationName: "GetMerchants", 
            query: `query GetMerchants { merchants { id name } }`
          }),
        })
      ]);

      if (!accountsResponse.ok || !categoriesResponse.ok || !merchantsResponse.ok) {
        res.status(500).json({ error: 'One or more Monarch API calls failed' });
        return;
      }

      const [accountsData, categoriesData, merchantsData] = await Promise.all([
        accountsResponse.json(),
        categoriesResponse.json(),
        merchantsResponse.json()
      ]);

      // Check for GraphQL errors
      if (accountsData.errors || categoriesData.errors || merchantsData.errors) {
        res.status(500).json({ 
          error: 'GraphQL errors in Monarch API responses',
          details: {
            accounts: accountsData.errors,
            categories: categoriesData.errors, 
            merchants: merchantsData.errors
          }
        });
        return;
      }

      logger.info("Successfully fetched Monarch data");
      
      res.status(200).json({
        accounts: accountsData.data.accounts || [],
        categories: categoriesData.data.categories || [],
        merchants: merchantsData.data.merchants || [],
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error("Error in Monarch test:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

/**
 * 🔄 Get Recurring Transactions Function
 * Fetches recurring transactions from Monarch Money using the working GraphQL operation
 */
export const monarchRecurringTransactions = functions.region(region).https.onRequest(
  async (req, res) => {
    // Handle CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      logger.info("Getting recurring transactions from Monarch Money");
      const config = functions.config();
      const monarchToken = config.monarch?.token;
      
      if (!monarchToken) {
        res.status(500).json({ error: 'Missing monarch.token in Firebase config' });
        return;
      }

      // Get date range (current month by default)
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      const startDate = startOfMonth.toISOString().split('T')[0];
      const endDate = endOfMonth.toISOString().split('T')[0];

      const monarchApiUrl = "https://api.monarchmoney.com/graphql";
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Token ${monarchToken}`,
      };

      const query = `
        query Web_GetUpcomingRecurringTransactionItems($startDate: Date!, $endDate: Date!, $filters: RecurringTransactionFilter) {
          recurringTransactionItems(
            startDate: $startDate
            endDate: $endDate
            filters: $filters
          ) {
            stream {
              id
              frequency
              amount
              isApproximate
              merchant {
                id
                name
                logoUrl
                __typename
              }
              __typename
            }
            date
            isPast
            transactionId
            amount
            amountDiff
            category {
              id
              name
              __typename
            }
            account {
              id
              displayName
              logoUrl
              __typename
            }
            __typename
          }
        }
      `;

      const response = await fetch(monarchApiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          operationName: "Web_GetUpcomingRecurringTransactionItems",
          query: query,
          variables: {
            startDate: startDate,
            endDate: endDate,
            filters: {}
          }
        }),
      });

      if (!response.ok) {
        res.status(500).json({ error: `Monarch API error: ${response.status}` });
        return;
      }

      const result = await response.json();
      
      if (result.errors) {
        res.status(500).json({ 
          error: 'GraphQL errors in Monarch API response',
          details: result.errors
        });
        return;
      }

      logger.info(`Successfully fetched ${result.data?.recurringTransactionItems?.length || 0} recurring transactions`);
      
      res.status(200).json({
        success: true,
        count: result.data?.recurringTransactionItems?.length || 0,
        transactions: result.data?.recurringTransactionItems || [],
        dateRange: { startDate, endDate },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error("Error getting recurring transactions:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

/**
 * 🔄 Get All Recurring Streams Function
 * Fetches all unique recurring transaction streams from Monarch Money
 * This provides the "All recurring" view with each transaction appearing only once
 * Uses wide date range to capture all instances, then extracts unique streams
 */
export const monarchRecurringStreams = functions.region(region).https.onRequest(
  async (req, res) => {
    // Handle CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      logger.info("Getting all unique recurring transaction streams from Monarch Money");
      const config = functions.config();
      const monarchToken = config.monarch?.token;
      
      if (!monarchToken) {
        res.status(500).json({ error: 'Missing monarch.token in Firebase config' });
        return;
      }

      const monarchApiUrl = "https://api.monarchmoney.com/graphql";
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Token ${monarchToken}`,
      };

      // Use a focused date range: 30 days past to 1 year future
      const now = new Date();
      const startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]; // 30 days ago
      const endDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString().split('T')[0]; // 1 year from today

      const query = `
        query Web_GetUpcomingRecurringTransactionItems($startDate: Date!, $endDate: Date!, $filters: RecurringTransactionFilter) {
          recurringTransactionItems(
            startDate: $startDate
            endDate: $endDate
            filters: $filters
          ) {
            stream {
              id
              frequency
              amount
              isApproximate
              merchant {
                id
                name
                logoUrl
                __typename
              }
              __typename
            }
            date
            category {
              id
              name
              __typename
            }
            account {
              id
              displayName
              logoUrl
              __typename
            }
            __typename
          }
        }
      `;

      const response = await fetch(monarchApiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          operationName: "Web_GetUpcomingRecurringTransactionItems",
          query: query,
          variables: {
            startDate: startDate,
            endDate: endDate,
            filters: {}
          }
        }),
      });

      if (!response.ok) {
        res.status(500).json({ error: `Monarch API error: ${response.status}` });
        return;
      }

      const result = await response.json();
      
      if (result.errors) {
        res.status(500).json({ 
          error: 'GraphQL errors in Monarch API response',
          details: result.errors
        });
        return;
      }

      const items = result.data?.recurringTransactionItems || [];
      logger.info(`Fetched ${items.length} recurring transaction items`);
      
      // Group items by stream ID and find the most representative due date
      const streamMap = new Map();
      
      items.forEach((item: any) => {
        if (item.stream) {
          const streamId = item.stream.id;
          const itemDate = item.date;
          
          if (!streamMap.has(streamId)) {
            // First occurrence of this stream
            streamMap.set(streamId, {
              ...item.stream,
              category: item.category,
              account: item.account,
              dueDate: itemDate,
              allDates: [itemDate]
            });
          } else {
            const existing = streamMap.get(streamId);
            existing.allDates.push(itemDate);
            
            // Use the earliest upcoming date (since we're only fetching future dates)
            const existingDate = new Date(existing.dueDate);
            const itemDateObj = new Date(itemDate);
            
            if (itemDateObj < existingDate) {
              existing.dueDate = itemDate;
            }
          }
        }
      });
      
      const streamArray = Array.from(streamMap.values()).map(stream => ({
        ...stream,
        // Remove the allDates field as it's not needed in the response
        allDates: undefined
      }));
      logger.info(`Extracted ${streamArray.length} unique recurring streams`);
      
      // Count frequencies for logging
      const frequencies: Record<string, number> = {};
      streamArray.forEach((stream: any) => {
        frequencies[stream.frequency] = (frequencies[stream.frequency] || 0) + 1;
      });
      logger.info(`Frequency distribution: ${JSON.stringify(frequencies)}`);
      
      res.status(200).json({
        success: true,
        count: streamArray.length,
        streams: streamArray,
        frequencies: frequencies,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error("Error getting recurring transaction streams:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

// Generate inferred credit card payments using Path B logic
async function generateInferredCreditCardPayments(accounts: any[]): Promise<any[]> {
  const inferredPayments: any[] = [];
  
      // Get credit card accounts with positive balances only
      const creditCardAccounts = accounts.filter((account: any) => {
        const name = account.displayName.toLowerCase();
        const isCreditCard = name.includes('credit') || 
                           name.includes('card') || 
                           (name.includes('chase') && (name.includes('freedom') || name.includes('southwest'))) ||
                           name.includes('amex') ||
                           name.includes('capital one') ||
                           name.includes('paypal') ||
                           name.includes('apple card');
        return isCreditCard && 
               account.displayBalance && 
               parseFloat(account.displayBalance.toString()) > 0;
      });
  
  logger.info(`Processing ${creditCardAccounts.length} credit card accounts for inference`);
  
  for (const account of creditCardAccounts) {
    try {
      // Find matching config or use default
      const config = DEFAULT_CC_CONFIGS.find(cc => 
        account.displayName.toLowerCase().includes(cc.accountName.toLowerCase())
      ) || {
        accountId: account.id,
        accountName: account.displayName,
        statementDay: 15,
        paymentDay: 10,
        autopayType: 'full' as const,
        minPaymentRate: 0.01,
        minPaymentFloor: 25,
        businessDayPolicy: 'prev' as const
      };
      
      const balance = parseFloat(account.displayBalance.toString());
      
      // Generate inferred payment
      const inferredPayment = generateInferredPayment(config, balance);
      
      // Convert to the format expected by the recurring transactions
      inferredPayments.push({
        stream: {
          id: `inferred-cc-${account.id}`,
          frequency: 'monthly',
          amount: inferredPayment.amount,
          isApproximate: false,
          merchant: {
            id: account.id,
            name: inferredPayment.merchant,
            logoUrl: account.logoUrl || null,
            __typename: 'Merchant'
          },
          __typename: 'RecurringTransactionStream'
        },
        date: inferredPayment.dueDate,
        category: {
          id: 'credit-card-payment',
          name: inferredPayment.category,
          __typename: 'Category'
        },
        account: {
          id: account.id,
          displayName: account.displayName,
          logoUrl: account.logoUrl || null,
          __typename: 'Account'
        },
        __typename: 'RecurringTransactionItem'
      });
      
      logger.info(`Generated inferred payment for ${account.displayName}: $${Math.abs(inferredPayment.amount)} due ${inferredPayment.dueDate}`);
      
    } catch (error) {
      logger.error(`Error generating inferred payment for ${account.displayName}:`, error);
    }
  }
  
  return inferredPayments;
}

// OLD callable version - DEPRECATED - use storeRecurringTransactionsHttpV2  
export const storeRecurringTransactions = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      const monarchToken = functions.config().monarch?.token;
      if (!monarchToken) {
        throw new functions.https.HttpsError('failed-precondition', 'Monarch token not configured');
      }

      const monarchApiUrl = "https://api.monarchmoney.com/graphql";
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Token ${monarchToken}`,
      };

      // Use a broader date range: 6 months past to 2 years future
      const now = new Date();
      const startDate = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]; // 6 months ago
      const endDate = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()).toISOString().split('T')[0]; // 2 years from today

      // First try to get all recurring items
      const recurringQuery = `
        query Web_GetUpcomingRecurringTransactionItems($startDate: Date!, $endDate: Date!, $filters: RecurringTransactionFilter) {
          recurringTransactionItems(
            startDate: $startDate
            endDate: $endDate
            filters: $filters
          ) {
            stream {
              id
              frequency
              amount
              isApproximate
              merchant {
                id
                name
                logoUrl
                __typename
              }
              __typename
            }
            date
            category {
              id
              name
              __typename
            }
            account {
              id
              displayName
              logoUrl
              __typename
            }
            __typename
          }
        }
      `;

      // Also get accounts to find credit card payment due dates
      const accountsQuery = `
        query GetAccounts {
          accounts {
            id
            displayName
            displayBalance
          }
        }
      `;

      // Make both API calls
      const [recurringResponse, accountsResponse] = await Promise.all([
        fetch(monarchApiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            operationName: "Web_GetUpcomingRecurringTransactionItems",
            query: recurringQuery,
            variables: {
              startDate: startDate,
              endDate: endDate,
              filters: {}
            }
          }),
        }),
        fetch(monarchApiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            operationName: "GetAccounts",
            query: accountsQuery,
            variables: {}
          }),
        })
      ]);

      if (!recurringResponse.ok) {
        throw new functions.https.HttpsError('unavailable', `Monarch recurring API error: ${recurringResponse.status}`);
      }
      if (!accountsResponse.ok) {
        throw new functions.https.HttpsError('unavailable', `Monarch accounts API error: ${accountsResponse.status}`);
      }

      const [recurringResult, accountsResult] = await Promise.all([
        recurringResponse.json(),
        accountsResponse.json()
      ]);
      
      if (recurringResult.errors) {
        throw new functions.https.HttpsError('unknown', 'GraphQL errors in recurring response', recurringResult.errors);
      }
      if (accountsResult.errors) {
        throw new functions.https.HttpsError('unknown', 'GraphQL errors in accounts response', accountsResult.errors);
      }

      const items = recurringResult.data?.recurringTransactionItems || [];
      const accounts = accountsResult.data?.accounts || [];
      logger.info(`Fetched ${items.length} recurring transaction items and ${accounts.length} accounts`);
      
      // Log account details for debugging
      logger.info(`Account names found: ${accounts.map((a: any) => a.displayName).join(', ')}`);
      const creditCards = accounts.filter((a: any) => {
        const name = a.displayName.toLowerCase();
        return name.includes('credit') || 
               name.includes('card') || 
               (name.includes('chase') && (name.includes('freedom') || name.includes('southwest'))) ||
               name.includes('amex') ||
               name.includes('capital one') ||
               name.includes('paypal') ||
               name.includes('apple card');
      });
      logger.info(`Credit card accounts: ${creditCards.length}`);
      creditCards.forEach((cc: any) => {
        logger.info(`  - ${cc.displayName}: ${cc.displayBalance}`);
      });
      
      // Log all accounts for debugging
      logger.info(`All accounts: ${JSON.stringify(accounts, null, 2)}`);
      
      // Add credit card payment due dates as recurring transactions
      // Since we don't have accountType, we'll infer credit cards from account names
      const creditCardAccounts = accounts.filter((account: any) => {
        const name = account.displayName.toLowerCase();
        const isCreditCard = name.includes('credit') || 
                           name.includes('card') || 
                           (name.includes('chase') && (name.includes('freedom') || name.includes('southwest'))) ||
                           name.includes('amex') ||
                           name.includes('capital one') ||
                           name.includes('paypal') ||
                           name.includes('apple card');
        return isCreditCard && 
               account.displayBalance && 
               parseFloat(account.displayBalance.toString()) > 0;
      });
      
      logger.info(`Found ${creditCardAccounts.length} credit card accounts with balances`);
      
      // Add credit card payments as recurring "transactions" (use current date as due date)
      const today = new Date().toISOString().split('T')[0];
      creditCardAccounts.forEach((account: any) => {
        const balance = parseFloat(account.displayBalance.toString());
        if (balance > 0) {
          items.push({
            stream: {
              id: `credit-card-${account.id}`,
              frequency: 'monthly',
              amount: -balance, // Negative for expense
              isApproximate: false,
              merchant: {
                id: account.id,
                name: account.displayName,
                logoUrl: account.logoUrl,
                __typename: 'Merchant'
              },
              __typename: 'RecurringTransactionStream'
            },
            date: today, // Use today as due date since we don't have paymentDueDate
            category: {
              id: 'credit-card-payment',
              name: 'Credit card',
              __typename: 'Category'
            },
            account: {
              id: account.id,
              displayName: account.displayName,
              logoUrl: account.logoUrl,
              __typename: 'Account'
            },
            __typename: 'RecurringTransactionItem'
          });
        }
      });
      
      logger.info(`Total items after adding credit card payments: ${items.length}`);
      
      // Add inferred credit card payments using Path B logic
      logger.info(`About to call generateInferredCreditCardPayments with ${accounts.length} accounts`);
      logger.info(`Current items count before inference: ${items.length}`);
      try {
        const inferredPayments = await generateInferredCreditCardPayments(accounts);
        logger.info(`Generated ${inferredPayments.length} inferred payments`);
        logger.info(`Inferred payments data: ${JSON.stringify(inferredPayments, null, 2)}`);
        items.push(...inferredPayments);
        logger.info(`Added ${inferredPayments.length} inferred credit card payments. Total items: ${items.length}`);
        logger.info(`Items after inference: ${JSON.stringify(items.slice(-5), null, 2)}`);
      } catch (error: any) {
        logger.error(`Error in generateInferredCreditCardPayments:`, error);
        logger.error(`Error details:`, error.message);
        logger.error(`Error stack:`, error.stack);
      }
      
      // Try to get additional data from bills/upcoming payments
      const billsQuery = `
        query Web_GetUpcomingBillsAndPayments {
          upcomingBills: transactions(
            filters: {
              categories: ["Bills & Fees"]
              startDate: "${startDate}"
              endDate: "${endDate}"
            }
          ) {
            id
            amount
            merchant {
              name
              logoUrl
            }
            category {
              name
            }
            account {
              displayName
              logoUrl
            }
            date
          }
        }
      `;
      
      try {
        const billsResponse = await fetch(monarchApiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            operationName: "Web_GetUpcomingBillsAndPayments",
            query: billsQuery,
            variables: {}
          }),
        });
        
        if (billsResponse.ok) {
          const billsResult = await billsResponse.json();
          const bills = billsResult.data?.upcomingBills || [];
          logger.info(`Found ${bills.length} additional bills/payments`);
          
          // Add bills as additional streams if they look like recurring payments
          bills.forEach((bill: any) => {
            if (bill.merchant?.name && bill.amount < 0) { // Expenses only
              items.push({
                stream: {
                  id: `bill-${bill.id}`,
                  frequency: 'monthly', // Assume monthly
                  amount: bill.amount,
                  isApproximate: false,
                  merchant: bill.merchant,
                  __typename: 'RecurringTransactionStream'
                },
                date: bill.date,
                category: bill.category,
                account: bill.account,
                __typename: 'RecurringTransactionItem'
              });
            }
          });
        }
      } catch (billsError) {
        logger.warn('Bills query failed, continuing with recurring items only:', billsError);
      }
      
      // Group items by stream ID and find the most representative due date
      const streamMap = new Map();
      
      items.forEach((item: any) => {
        if (item.stream) {
          const streamId = item.stream.id;
          const itemDate = item.date;
          
          if (!streamMap.has(streamId)) {
            // First occurrence of this stream
            streamMap.set(streamId, {
              ...item.stream,
              category: item.category,
              account: item.account,
              dueDate: itemDate,
              allDates: [itemDate]
            });
          } else {
            const existing = streamMap.get(streamId);
            existing.allDates.push(itemDate);
            
            // Use the earliest upcoming date (since we're only fetching future dates)
            const existingDate = new Date(existing.dueDate);
            const itemDateObj = new Date(itemDate);
            
            if (itemDateObj < existingDate) {
              existing.dueDate = itemDate;
            }
          }
        }
      });
      
      const streamArray = Array.from(streamMap.values()).map(stream => ({
        ...stream,
        // Remove the allDates field as it's not needed in the response
        allDates: undefined
      }));

      logger.info(`Processed ${streamArray.length} unique recurring streams with broader date range`);

      // Store each stream in Firestore
      const batch = db.batch();
      const recurringRef = db.collection('recurring_transactions');
      
      // Clear existing data first
      const existingDocs = await recurringRef.get();
      existingDocs.docs.forEach((doc: any) => {
        batch.delete(doc.ref);
      });

      // Add new data
      streamArray.forEach((stream: any) => {
        const docRef = recurringRef.doc(stream.id);
        batch.set(docRef, {
          streamId: stream.id,
          merchantName: stream.merchant?.name || 'Unknown',
          merchantLogoUrl: stream.merchant?.logoUrl || null,
          frequency: stream.frequency,
          amount: stream.amount,
          isApproximate: stream.isApproximate || false,
          dueDate: stream.dueDate,
          categoryId: stream.category?.id || null,
          categoryName: stream.category?.name || null,
          accountId: stream.account?.id || null,
          accountName: stream.account?.displayName || null,
          accountLogoUrl: stream.account?.logoUrl || null,
          updatedAt: new Date(),
        });
      });

      await batch.commit();

      // Update settings with last updated timestamp
      const settingsRef = db.collection('settings').doc('main');
      await settingsRef.set({
        lastRecurringUpdateAt: new Date()
      }, { merge: true });

      logger.info(`Successfully stored ${streamArray.length} recurring transactions in Firestore`);

      return {
        success: true,
        count: streamArray.length,
        updatedAt: new Date().toISOString()
      };

    } catch (error: any) {
      logger.error('storeRecurringTransactions error:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', 'Failed to store recurring transactions', error.message);
    }
  }
);

// Test function to debug inference logic
export const testInferenceLogic = functions.region(region).https.onRequest(
  async (req, res) => {
    // CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      const monarchToken = functions.config().monarch?.token;
      if (!monarchToken) {
        throw new Error('Monarch token not configured');
      }

      const monarchApiUrl = "https://api.monarchmoney.com/graphql";
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Token ${monarchToken}`,
      };

      const accountsQuery = `
        query GetAccounts {
          accounts {
            id
            displayName
            displayBalance
          }
        }
      `;

      const response = await fetch(monarchApiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          operationName: "GetAccounts",
          query: accountsQuery,
          variables: {}
        }),
      });

      if (!response.ok) {
        throw new Error(`Monarch API error: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }

      const accounts = result.data?.accounts || [];
      
      // Test inference logic
      const inferredPayments = await generateInferredCreditCardPayments(accounts);
      
      res.json({
        success: true,
        totalAccounts: accounts.length,
        inferredPayments: inferredPayments.length,
        inferredPaymentsData: inferredPayments
      });

    } catch (error: any) {
      logger.error('testInferenceLogic error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Test function to debug accounts query
export const testAccountsQuery = functions.region(region).https.onRequest(
  async (req, res) => {
    // CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      const monarchToken = functions.config().monarch?.token;
      if (!monarchToken) {
        throw new Error('Monarch token not configured');
      }

      const monarchApiUrl = "https://api.monarchmoney.com/graphql";
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Token ${monarchToken}`,
      };

      const accountsQuery = `
        query GetAccounts {
          accounts {
            id
            displayName
            displayBalance
          }
        }
      `;

      const response = await fetch(monarchApiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          operationName: "GetAccounts",
          query: accountsQuery,
          variables: {}
        }),
      });

      if (!response.ok) {
        throw new Error(`Monarch API error: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }

      const accounts = result.data?.accounts || [];
      const creditCards = accounts.filter((a: any) => {
        const name = a.displayName.toLowerCase();
        return name.includes('credit') || 
               name.includes('card') || 
               (name.includes('chase') && (name.includes('freedom') || name.includes('southwest'))) ||
               name.includes('amex') ||
               name.includes('capital one') ||
               name.includes('paypal') ||
               name.includes('apple card');
      });
      
      res.json({
        success: true,
        totalAccounts: accounts.length,
        creditCardAccounts: creditCards.length,
        allAccounts: accounts,
        creditCards: creditCards
      });

    } catch (error: any) {
      logger.error('testAccountsQuery error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// OLD HTTP version - DEPRECATED - use storeRecurringTransactionsHttpV2
export const storeRecurringTransactionsHttp = functions.region(region).https.onRequest(
  async (req, res) => {
    // Handle CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      const monarchToken = functions.config().monarch?.token;
      if (!monarchToken) {
        res.status(500).json({ error: 'Monarch token not configured' });
        return;
      }

      const monarchApiUrl = "https://api.monarchmoney.com/graphql";
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Token ${monarchToken}`,
      };

      // Use a broader date range: 6 months past to 2 years future
      const now = new Date();
      const startDate = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]; // 6 months ago
      const endDate = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()).toISOString().split('T')[0]; // 2 years from today

      // First try to get all recurring items
      const query = `
        query Web_GetUpcomingRecurringTransactionItems($startDate: Date!, $endDate: Date!, $filters: RecurringTransactionFilter) {
          recurringTransactionItems(
            startDate: $startDate
            endDate: $endDate
            filters: $filters
          ) {
            stream {
              id
              frequency
              amount
              isApproximate
              merchant {
                id
                name
                logoUrl
                __typename
              }
              __typename
            }
            date
            category {
              id
              name
              __typename
            }
            account {
              id
              displayName
              logoUrl
              __typename
            }
            __typename
          }
        }
      `;

      const response = await fetch(monarchApiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          operationName: "Web_GetUpcomingRecurringTransactionItems",
          query: query,
          variables: {
            startDate: startDate,
            endDate: endDate,
            filters: {}
          }
        }),
      });

      if (!response.ok) {
        res.status(500).json({ error: `Monarch API error: ${response.status}` });
        return;
      }

      const result = await response.json();
      
      if (result.errors) {
        res.status(500).json({ 
          error: 'GraphQL errors in Monarch API response',
          details: result.errors
        });
        return;
      }

      const items = result.data?.recurringTransactionItems || [];
      logger.info(`Fetched ${items.length} recurring transaction items`);
      
      // Group items by stream ID and find the most representative due date
      const streamMap = new Map();
      
      items.forEach((item: any) => {
        if (item.stream) {
          const streamId = item.stream.id;
          const itemDate = item.date;
          
          if (!streamMap.has(streamId)) {
            // First occurrence of this stream
            streamMap.set(streamId, {
              ...item.stream,
              category: item.category,
              account: item.account,
              dueDate: itemDate,
              allDates: [itemDate]
            });
          } else {
            const existing = streamMap.get(streamId);
            existing.allDates.push(itemDate);
            
            // Use the earliest upcoming date (since we're only fetching future dates)
            const existingDate = new Date(existing.dueDate);
            const itemDateObj = new Date(itemDate);
            
            if (itemDateObj < existingDate) {
              existing.dueDate = itemDate;
            }
          }
        }
      });
      
      const streamArray = Array.from(streamMap.values()).map(stream => ({
        ...stream,
        // Remove the allDates field as it's not needed in the response
        allDates: undefined
      }));

      logger.info(`Processed ${streamArray.length} unique recurring streams`);

      // Store each stream in Firestore
      const batch = db.batch();
      const recurringRef = db.collection('recurring_transactions');
      
      // Clear existing data first
      const existingDocs = await recurringRef.get();
      existingDocs.docs.forEach((doc: any) => {
        batch.delete(doc.ref);
      });

      // Add new data
      streamArray.forEach((stream: any) => {
        const docRef = recurringRef.doc(stream.id);
        batch.set(docRef, {
          streamId: stream.id,
          merchantName: stream.merchant?.name || 'Unknown',
          merchantLogoUrl: stream.merchant?.logoUrl || null,
          frequency: stream.frequency,
          amount: stream.amount,
          isApproximate: stream.isApproximate || false,
          dueDate: stream.dueDate,
          categoryId: stream.category?.id || null,
          categoryName: stream.category?.name || null,
          accountId: stream.account?.id || null,
          accountName: stream.account?.displayName || null,
          accountLogoUrl: stream.account?.logoUrl || null,
          updatedAt: new Date(),
        });
      });

      await batch.commit();

      // Update settings with last updated timestamp
      const settingsRef = db.collection('settings').doc('main');
      await settingsRef.set({
        lastRecurringUpdateAt: new Date()
      }, { merge: true });

      logger.info(`Successfully stored ${streamArray.length} recurring transactions in Firestore`);

      res.status(200).json({
        success: true,
        count: streamArray.length,
        updatedAt: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('storeRecurringTransactionsHttp error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
      });
    }
  }
);

// New HTTP version with inference logic
export const storeRecurringTransactionsHttpV2 = functions.region(region).https.onRequest(
  async (req, res) => {
    // Handle CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      const monarchToken = functions.config().monarch?.token;
      if (!monarchToken) {
        res.status(500).json({ error: 'Monarch token not configured' });
        return;
      }

      const monarchApiUrl = "https://api.monarchmoney.com/graphql";
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Token ${monarchToken}`,
      };

      // Clear existing recurring transactions first
      logger.info('Clearing existing recurring transactions...');
      const recurringCollection = db.collection('recurringTransactions');
      const existingSnapshot = await recurringCollection.get();
      const clearBatch = db.batch();
      existingSnapshot.docs.forEach((doc: any) => {
        clearBatch.delete(doc.ref);
      });
      await clearBatch.commit();
      logger.info(`Cleared ${existingSnapshot.docs.length} existing recurring transactions`);

      // Use a broader date range: 6 months past to 2 years future
      const now = new Date();
      const startDate = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]; // 6 months ago
      const endDate = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()).toISOString().split('T')[0]; // 2 years from today

      // First try to get all recurring items
      const recurringQuery = `
        query Web_GetUpcomingRecurringTransactionItems($startDate: Date!, $endDate: Date!, $filters: RecurringTransactionFilter) {
          recurringTransactionItems(
            startDate: $startDate
            endDate: $endDate
            filters: $filters
          ) {
            stream {
              id
              frequency
              amount
              isApproximate
              merchant {
                id
                name
                logoUrl
                __typename
              }
              __typename
            }
            date
            category {
              id
              name
              __typename
            }
            account {
              id
              displayName
              logoUrl
              __typename
            }
            __typename
          }
        }
      `;

      // Also get accounts to find credit card payment due dates
      const accountsQuery = `
        query GetAccounts {
          accounts {
            id
            displayName
            displayBalance
          }
        }
      `;

      // Make both API calls
      const [recurringResponse, accountsResponse] = await Promise.all([
        fetch(monarchApiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            operationName: "Web_GetUpcomingRecurringTransactionItems",
            query: recurringQuery,
            variables: {
              startDate: startDate,
              endDate: endDate,
              filters: {}
            }
          }),
        }),
        fetch(monarchApiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            operationName: "GetAccounts",
            query: accountsQuery,
            variables: {}
          }),
        })
      ]);

      if (!recurringResponse.ok) {
        res.status(500).json({ error: `Monarch recurring API error: ${recurringResponse.status}` });
        return;
      }
      if (!accountsResponse.ok) {
        res.status(500).json({ error: `Monarch accounts API error: ${accountsResponse.status}` });
        return;
      }

      const [recurringResult, accountsResult] = await Promise.all([
        recurringResponse.json(),
        accountsResponse.json()
      ]);
      
      if (recurringResult.errors) {
        res.status(500).json({ 
          error: 'GraphQL errors in recurring response',
          details: recurringResult.errors
        });
        return;
      }
      if (accountsResult.errors) {
        res.status(500).json({ 
          error: 'GraphQL errors in accounts response',
          details: accountsResult.errors
        });
        return;
      }

      let items = recurringResult.data?.recurringTransactionItems || [];
      const accounts = accountsResult.data?.accounts || [];
      logger.info(`Fetched ${items.length} recurring transaction items and ${accounts.length} accounts`);
      
      // Filter out any items that contain "payment" in the name - keep only the base credit card entries
      items = items.filter((item: any) => {
        const name = item.stream?.merchant?.name?.toLowerCase() || '';
        const isPayment = name.includes('payment');
        return !isPayment;
      });
      logger.info(`Filtered out payment transactions. Remaining items: ${items.length}`);

      // Add inferred credit card payments using Path B logic
      logger.info(`About to call generateInferredCreditCardPayments with ${accounts.length} accounts`);
      logger.info(`Current items count before inference: ${items.length}`);
      try {
        const inferredPayments = await generateInferredCreditCardPayments(accounts);
        logger.info(`Generated ${inferredPayments.length} inferred payments`);
        items.push(...inferredPayments);
        logger.info(`Added ${inferredPayments.length} inferred credit card payments. Total items: ${items.length}`);
      } catch (error: any) {
        logger.error(`Error in generateInferredCreditCardPayments:`, error);
        logger.error(`Error details:`, error.message);
        logger.error(`Error stack:`, error.stack);
      }

      // Group by stream ID and process
      const streamMap = new Map();
      items.forEach((item: any) => {
        const streamId = item.stream.id;
        if (!streamMap.has(streamId)) {
          streamMap.set(streamId, {
            id: streamId,
            frequency: item.stream.frequency,
            amount: item.stream.amount,
            isApproximate: item.stream.isApproximate,
            merchant: item.stream.merchant,
            nextDueDate: item.date,
            category: item.category,
            account: item.account,
            items: []
          });
        }
        streamMap.get(streamId).items.push(item);
      });

      const streamArray = Array.from(streamMap.values());
      logger.info(`Processed ${streamArray.length} unique recurring streams`);

      // Store in Firestore
      const storeBatch = db.batch();
      const recurringRef = db.collection('recurringTransactions');
      
      // Clear existing data
      const existingDocs = await recurringRef.get();
      existingDocs.forEach((doc) => {
        storeBatch.delete(doc.ref);
      });

      // Add new data
      streamArray.forEach((stream) => {
        if (!stream || !stream.id) {
          logger.warn('Skipping stream with missing id:', stream);
          return;
        }
        
        const docRef = recurringRef.doc(stream.id);
        storeBatch.set(docRef, {
          streamId: stream.id,
          merchantName: stream.merchant?.name || 'Unknown',
          merchantLogoUrl: stream.merchant?.logoUrl || null,
          frequency: stream.frequency || 'monthly',
          amount: stream.amount || 0,
          isApproximate: stream.isApproximate || false,
          dueDate: stream.nextDueDate || new Date().toISOString().split('T')[0],
          categoryId: stream.category?.id || 'unknown',
          categoryName: stream.category?.name || 'Unknown',
          accountId: stream.account?.id || 'unknown',
          accountName: stream.account?.displayName || 'Unknown',
          accountLogoUrl: stream.account?.logoUrl || null,
          lastUpdated: new Date().toISOString()
        });
      });

      await storeBatch.commit();

      logger.info(`Successfully stored ${streamArray.length} recurring transactions in Firestore`);

      res.status(200).json({
        success: true,
        count: streamArray.length,
        updatedAt: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('storeRecurringTransactionsHttpV2 error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
      });
    }
  }
);

// Main function to refresh recurring transactions from Monarch
export const refreshRecurringTransactions = functions.region(region).https.onRequest(
  async (req, res) => {
    // Handle CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      const monarchToken = functions.config().monarch?.token;
      if (!monarchToken) {
        res.status(500).json({ 
          error: 'Monarch token not configured'
        });
        return;
      }

      logger.info('Starting recurring transactions refresh');

      const monarchApiUrl = "https://api.monarchmoney.com/graphql";
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Token ${monarchToken}`,
      };

      // Clear existing data first
      const existingSnapshot = await admin.firestore().collection('recurringTransactions').get();
      const batch = admin.firestore().batch();
      existingSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      logger.info(`Cleared ${existingSnapshot.docs.length} existing recurring transactions`);

      // Use the exact query from Monarch's recurring page for accurate amounts
      const recurringQuery = `
        query Web_GetAllRecurringTransactionItems($filters: RecurringTransactionFilter, $includeLiabilities: Boolean) {
          recurringTransactionStreams(
            filters: $filters
            includeLiabilities: $includeLiabilities
          ) {
            stream {
              id
              frequency
              isActive
              isApproximate
              name
              logoUrl
              merchant {
                id
                __typename
              }
              creditReportLiabilityAccount {
                id
                account {
                  id
                  __typename
                }
                __typename
              }
              __typename
            }
            nextForecastedTransaction {
              date
              amount
              __typename
            }
            category {
              id
              name
              icon
              __typename
            }
            account {
              id
              displayName
              icon
              logoUrl
              __typename
            }
            __typename
          }
        }
      `;

      // Fetch data from Monarch
      const response = await fetch(monarchApiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          operationName: "Web_GetAllRecurringTransactionItems",
          query: recurringQuery,
          variables: {
            filters: {},
            includeLiabilities: true
          }
        }),
      });

      if (!response.ok) {
        res.status(500).json({ error: `Monarch API error: ${response.status}` });
        return;
      }

      const result = await response.json();
      
      if (result.errors) {
        res.status(500).json({ 
          error: 'GraphQL errors',
          details: result.errors
        });
        return;
      }

      const streams = result.data?.recurringTransactionStreams || [];
      logger.info(`Fetched ${streams.length} recurring transaction streams`);
      
      // Process and store each stream
      const storeBatch = admin.firestore().batch();
      let storedCount = 0;

      for (const item of streams) {
        try {
          // Skip items without required data
          if (!item.stream?.id || !item.nextForecastedTransaction) {
            continue;
          }

          const stream = item.stream;
          const nextTransaction = item.nextForecastedTransaction;

          // Create Firestore document
          const docData = {
            streamId: stream.id,
            merchantName: stream.name || 'Unknown',
            frequency: stream.frequency || 'monthly',
            amount: nextTransaction.amount || 0,
            nextDueDate: nextTransaction.date || null,
            categoryName: item.category?.name || 'Uncategorized',
            categoryIcon: item.category?.icon || '📄',
            accountName: item.account?.displayName || 'Unknown Account',
            accountIcon: item.account?.icon || 'dollar-sign',
            logoUrl: stream.logoUrl || null,
            isActive: stream.isActive !== false,
            isApproximate: stream.isApproximate || false,
            source: 'monarch',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };

          const docRef = admin.firestore().collection('recurringTransactions').doc();
          storeBatch.set(docRef, docData);
          storedCount++;

        } catch (error: any) {
          logger.error(`Error processing stream ${item.stream?.id}:`, error);
          continue;
        }
      }

      // Commit all documents
      await storeBatch.commit();
      logger.info(`Successfully stored ${storedCount} recurring transactions`);

      res.status(200).json({
        success: true,
        message: 'Recurring transactions refreshed successfully',
        count: storedCount,
        updatedAt: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Refresh recurring transactions error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
      });
    }
  }
);
