/**
 * Budget Calendar Firebase Cloud Functions
 * Minimal working version with only essential functions
 */

import { https } from "firebase-functions/v1";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";
import { google } from "googleapis";

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// Set default region to us-central1 (Iowa) for all functions
// Note: us-south1 not enabled for this Firebase project yet
const region = 'us-central1';

/**
 * 📊 Budget Projection Function
 * Replaces: supabase/functions/budget-projection
 */
export const budgetProjectionV1 = functions.region(region).https.onCall(
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
        data.forEach((h: { date: string }) => holidays.add(h.date));
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

        // Add debug mode header if requested
        if (data?.debugMode) {
          headers["X-Debug-Mode"] = "true";
          logger.info("Debug mode enabled - Chrome will be visible on backend");
        }

        logger.info(`Calling Flask API: ${apiRefreshUrl}`);
        logger.info(`Headers: ${JSON.stringify(headers, null, 2)}`);

        const flaskResponse = await fetch(apiRefreshUrl, {
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

        // Parse response to check if job was actually started
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          logger.warn(`Failed to parse Flask response as JSON: ${responseText}`);
          responseData = { status: "unknown" };
        }

        logger.info(`Flask API response: ${JSON.stringify(responseData)}`);
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

/**
 * 📅 Calendar Sync Function
 * Replaces: supabase/functions/sync-calendar
 * Syncs projected balances and bills to Google Calendar
 */
export const syncCalendar = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      logger.info("Starting calendar sync");

      // Get Firebase config for Google credentials and calendar IDs
      const config = functions.config();
      const googleServiceAccountJson = config.google?.service_account_json;
      const env = data?.env || "dev"; // Default to dev for testing
      
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

      // Process each projection
      for (const [index, projection] of projections.entries()) {
        const dateStr = projection.projDate;
        
        // === BALANCE EVENTS ===
        const expectedBalanceSummary = index === 0
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
      }

      logger.info("Calendar sync completed successfully");
      
      return {
        success: true,
        message: "Calendar sync completed successfully",
        projectionsCount: projections.length,
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
