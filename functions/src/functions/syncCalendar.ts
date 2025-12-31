import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";
import { google } from "googleapis";

const db = getFirestore();
const region = 'us-central1';

async function getCalendarAuth() {
  const serviceAccountJson = functions.config().google?.service_account_json;
  if (!serviceAccountJson) {
    throw new Error('Google service account not configured');
  }
  
  // Handle both string and object formats
  let credentials;
  if (typeof serviceAccountJson === 'string') {
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch (parseError) {
      logger.error('Failed to parse service account JSON:', parseError);
      throw new Error('Invalid service account JSON format. Must be valid JSON string or object.');
    }
  } else {
    credentials = serviceAccountJson;
  }
  
  // Validate required fields
  if (!credentials.client_email || !credentials.private_key || !credentials.project_id) {
    throw new Error('Service account JSON missing required fields: client_email, private_key, or project_id');
  }
  
  const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return auth;
}

export const syncCalendar = functions
  .region(region)
  .runWith({
    timeoutSeconds: 540, // 9 minutes max timeout
    memory: '1GB' // Increased memory for large datasets
  })
  .https.onRequest(
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      const env = req.body?.env || 'dev';
      logger.info(`Starting calendar sync for environment: ${env}`);
      
      // Check Google service account configuration
      const googleConfig = functions.config().google;
      if (!googleConfig) {
        logger.error('Google configuration not found in Firebase Functions config');
        throw new Error('Google service account not configured. Run: firebase functions:config:set google.service_account_json="..."');
      }
      
      if (!googleConfig.service_account_json) {
        logger.error('Google service_account_json not found in config');
        throw new Error('Google service account JSON not configured. Run: firebase functions:config:set google.service_account_json="..."');
      }
      
      logger.info('Google service account configuration found');
      
      const auth = await getCalendarAuth();
      const calendar = google.calendar({ version: 'v3', auth });
      
      const billsCalendarId = env === 'prod' ? googleConfig?.prod_bills_calendar_id : googleConfig?.dev_bills_calendar_id;
      const balanceCalendarId = env === 'prod' ? googleConfig?.prod_balance_calendar_id : googleConfig?.dev_balance_calendar_id;
      
      logger.info(`Calendar IDs - Bills: ${billsCalendarId ? 'configured' : 'MISSING'}, Balance: ${balanceCalendarId ? 'configured' : 'MISSING'}`);
      
      if (!billsCalendarId || !balanceCalendarId) {
        const missing = [];
        if (!billsCalendarId) missing.push(`${env}_bills_calendar_id`);
        if (!balanceCalendarId) missing.push(`${env}_balance_calendar_id`);
        throw new Error(`Calendar IDs not configured for environment '${env}'. Missing: ${missing.join(', ')}. Run: firebase functions:config:set google.${missing[0]}="..."`);
      }
      
      // Get all projections from database
      // Note: Projections already include weekend/holiday adjustments from budgetProjection function
      const projectionsSnapshot = await db.collection('projections').get();
      const projections = projectionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      
      logger.info(`Found ${projections.length} projections to sync (with weekend/holiday adjustments)`);
      
      if (projections.length === 0) {
        res.status(200).json({
          success: true,
          message: 'No projections found - calendar sync skipped',
          eventsCreated: 0,
          eventsUpdated: 0,
          eventsDeleted: 0,
          environment: env,
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Get date range for projections
      const projectionDates = projections.map(p => p.projDate).sort();
      const startDate = projectionDates[0];
      const endDate = projectionDates[projectionDates.length - 1];
      const timeMin = new Date(startDate).toISOString();
      const timeMax = new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000).toISOString();
      
      logger.info(`Syncing calendar for date range: ${startDate} to ${endDate}`);
      
      // Get existing events from both calendars
      const [existingBillEvents, existingBalanceEvents] = await Promise.all([
        calendar.events.list({
          calendarId: billsCalendarId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime'
        }),
        calendar.events.list({
          calendarId: balanceCalendarId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime'
        })
      ]);
      
      // Create maps for efficient lookup
      const existingBillEventsByDateAndName = new Map();
      const existingBalanceEventsByDate = new Map();
      
      // Map existing bill events
      if (existingBillEvents.data.items) {
        for (const event of existingBillEvents.data.items) {
          if (event.start?.date && event.summary) {
            const key = `${event.start.date}-${event.summary}`;
            existingBillEventsByDateAndName.set(key, event);
          }
        }
      }
      
      // Map existing balance events
      if (existingBalanceEvents.data.items) {
        for (const event of existingBalanceEvents.data.items) {
          if ((event.summary?.includes('Budget Projection') || event.summary?.includes('Balance:')) && event.start?.date) {
            existingBalanceEventsByDate.set(event.start.date, event);
          }
        }
      }
      
      let eventsCreated = 0;
      let eventsUpdated = 0;
      let eventsDeleted = 0;
      
      // Process projections in smaller batches with better error handling
      const BATCH_SIZE = 5; // Reduced batch size for more reliable processing
      
      // Helper function to add delay between API calls to avoid rate limiting
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      // Helper function to handle rate limiting specifically
      async function withRateLimit<T>(operation: () => Promise<T>, maxRetries = 5): Promise<T> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await operation();
          } catch (error: any) {
            if (error?.code === 429 || error?.message?.includes('quota') || error?.message?.includes('rate limit')) {
              const delayMs = Math.min(1000 * Math.pow(2, attempt), 30000); // Exponential backoff, max 30s
              logger.warn(`Rate limited, retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
              continue;
            }
            throw error; // Re-throw if not a rate limit error
          }
        }
        throw new Error(`Failed after ${maxRetries} attempts due to rate limiting`);
      }
      
      
      for (let i = 0; i < projections.length; i += BATCH_SIZE) {
        const batch = projections.slice(i, i + BATCH_SIZE);
        logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(projections.length / BATCH_SIZE)} (${batch.length} projections)`);
        
        // Process each projection sequentially within the batch to ensure reliability
        for (const projection of batch) {
          const projDate = projection.projDate;
          logger.info(`Processing projection for ${projDate}...`);
          
          // 1. Handle bill events
          if (projection.bills && projection.bills.length > 0) {
            for (const bill of projection.bills) {
              const billAmount = Math.round(Math.abs(bill.amount));
              const billAmountFormatted = billAmount.toLocaleString('en-US');
              const billSummary = `${bill.name} ${bill.amount < 0 ? '-' : ''}$${billAmountFormatted}`;
              const billEventKey = `${projDate}-${billSummary}`;
              const existingBillEvent = existingBillEventsByDateAndName.get(billEventKey);
              
              const desiredBillEvent = {
                summary: billSummary,
                description: `Amount: ${bill.amount < 0 ? '-' : ''}$${billAmountFormatted}\nCategory: ${bill.category || 'Unknown'}`,
                start: { date: projDate },
                end: { date: projDate }
              };
              
              await withRateLimit(async () => {
                if (existingBillEvent) {
                  // Check if bill event needs updating
                  const needsUpdate = 
                    existingBillEvent.summary !== desiredBillEvent.summary ||
                    existingBillEvent.description !== desiredBillEvent.description;
                  
                  if (needsUpdate) {
                    await calendar.events.update({
                      calendarId: billsCalendarId,
                      eventId: existingBillEvent.id!,
                      requestBody: desiredBillEvent
                    });
                    eventsUpdated++;
                    logger.info(`Updated bill event: ${billSummary} for ${projDate}`);
                  }
                  
                  // Remove from map so we don't delete it later
                  existingBillEventsByDateAndName.delete(billEventKey);
                  
                } else {
                  // Create new bill event
                  await calendar.events.insert({
                    calendarId: billsCalendarId,
                    requestBody: desiredBillEvent
                  });
                  eventsCreated++;
                  logger.info(`Created bill event: ${billSummary} for ${projDate}`);
                }
              });
              
              // Small delay between bill operations
              await delay(50);
            }
          }
          
          // 2. Handle balance events
          const existingBalanceEvent = existingBalanceEventsByDate.get(projDate);
          
          const balanceAmount = Math.round(projection.projectedBalance || 0);
          const balanceAmountFormatted = balanceAmount.toLocaleString('en-US');
          
          // Check if this is today's projection
          const today = new Date();
          const todayCST = new Date(today.getTime() - (6 * 60 * 60 * 1000)); // UTC-6 for CST
          const todayString = todayCST.toISOString().split('T')[0];
          const isToday = projDate === todayString;
          
          const eventTitle = isToday ? 'Balance:' : 'Budget Projection:';
          const desiredBalanceEvent = {
            summary: `${eventTitle} $${balanceAmountFormatted}`,
            description: `Projected balance: $${balanceAmountFormatted}\nBills due: ${projection.bills?.length || 0}`,
            start: { date: projDate },
            end: { date: projDate }
          };
          
          await withRateLimit(async () => {
            if (existingBalanceEvent) {
              // Check if balance event needs updating
              const needsUpdate = 
                existingBalanceEvent.summary !== desiredBalanceEvent.summary ||
                existingBalanceEvent.description !== desiredBalanceEvent.description;
              
              if (needsUpdate) {
                await calendar.events.update({
                  calendarId: balanceCalendarId,
                  eventId: existingBalanceEvent.id!,
                  requestBody: desiredBalanceEvent
                });
                eventsUpdated++;
                logger.info(`Updated balance event for ${projDate}`);
              }
              
              // Remove from map so we don't delete it later
              existingBalanceEventsByDate.delete(projDate);
              
            } else {
              // Create new balance event
              await calendar.events.insert({
                calendarId: balanceCalendarId,
                requestBody: desiredBalanceEvent
              });
              eventsCreated++;
              logger.info(`Created balance event for ${projDate}`);
            }
          });
          
          // Small delay between projections
          await delay(100);
        }
        
        // Add delay between main batches
        if (i + BATCH_SIZE < projections.length) {
          logger.info(`Completed batch ${Math.floor(i / BATCH_SIZE) + 1}, pausing before next batch...`);
          await delay(500); // Longer delay between batches
        }
      }
      
      // Delete any remaining outdated events in batches
      const deleteOperations: Promise<void>[] = [];
      
      // Prepare delete operations for outdated bill events
      for (const [key, event] of existingBillEventsByDateAndName) {
        const deleteOp = async () => {
          try {
            await calendar.events.delete({
              calendarId: billsCalendarId,
              eventId: event.id!
            });
            eventsDeleted++;
            logger.info(`Deleted outdated bill event: ${key}`);
          } catch (error) {
            logger.error(`Error deleting bill event ${key}:`, error);
          }
        };
        deleteOperations.push(deleteOp());
      }
      
      // Prepare delete operations for outdated balance events
      for (const [date, event] of existingBalanceEventsByDate) {
        const deleteOp = async () => {
          try {
            await calendar.events.delete({
              calendarId: balanceCalendarId,
              eventId: event.id!
            });
            eventsDeleted++;
            logger.info(`Deleted outdated balance event for ${date}`);
          } catch (error) {
            logger.error(`Error deleting balance event for ${date}:`, error);
          }
        };
        deleteOperations.push(deleteOp());
      }
      
      // Execute delete operations with controlled concurrency
      logger.info(`Deleting ${deleteOperations.length} outdated events...`);
      const DELETE_CONCURRENT_LIMIT = 3; // Conservative limit for deletes
      for (let i = 0; i < deleteOperations.length; i += DELETE_CONCURRENT_LIMIT) {
        const deleteBatch = deleteOperations.slice(i, i + DELETE_CONCURRENT_LIMIT);
        await Promise.allSettled(deleteBatch);
        
        // Add delay between delete batches
        if (i + DELETE_CONCURRENT_LIMIT < deleteOperations.length) {
          await delay(150); // 150ms delay
        }
      }
      
      await db.collection('admin').doc('functionTimestamps').set({
        syncCalendar: Timestamp.now()
      }, { merge: true });
      
      res.status(200).json({
        success: true,
        message: `Calendar sync completed. Created ${eventsCreated}, updated ${eventsUpdated}, deleted ${eventsDeleted} events.`,
        eventsCreated,
        eventsUpdated,
        eventsDeleted,
        totalProjections: projections.length,
        environment: env,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Safely extract error details without circular references or problematic objects
      // Convert to plain object to avoid URLSearchParams and other non-serializable objects
      let errorDetails: any = {
        message: errorMessage,
        stack: errorStack
      };
      
      if (error instanceof Error) {
        errorDetails.name = error.name;
        // Only extract primitive properties (using type assertion for non-standard properties)
        const errorAny = error as any;
        if (errorAny.code && (typeof errorAny.code === 'string' || typeof errorAny.code === 'number')) {
          errorDetails.code = errorAny.code;
        }
        if (errorAny.status && typeof errorAny.status === 'number') {
          errorDetails.status = errorAny.status;
        }
        // Safely extract response data if it exists
        if (errorAny.response && typeof errorAny.response === 'object') {
          const resp = errorAny.response;
          errorDetails.response = {};
          if (typeof resp.status === 'number') errorDetails.response.status = resp.status;
          if (typeof resp.statusText === 'string') errorDetails.response.statusText = resp.statusText;
          if (resp.data && typeof resp.data === 'object') {
            // Only extract simple data properties
            if (typeof resp.data.error === 'string') errorDetails.response.error = resp.data.error;
            if (typeof resp.data.error_description === 'string') errorDetails.response.error_description = resp.data.error_description;
          }
        }
      }
      
      // Log as simple string to avoid serialization issues with complex error objects
      logger.error(`Error syncing calendar: ${errorMessage}${errorDetails.code ? ` (code: ${errorDetails.code})` : ''}${errorDetails.status ? ` (status: ${errorDetails.status})` : ''}`);
      
      // Return detailed error for debugging
      res.status(500).json({
        error: "Internal server error",
        message: errorMessage,
        details: errorDetails
      });
    }
  }
);
