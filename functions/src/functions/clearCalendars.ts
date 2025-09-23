import { getFirestore } from "firebase-admin/firestore";
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
  
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountJson,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return auth;
}

export const clearCalendars = functions
  .region(region)
  .runWith({
    timeoutSeconds: 540, // 9 minutes max timeout
    memory: '1GB' // Increased memory for large operations
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
      const auth = await getCalendarAuth();
      const calendar = google.calendar({ version: 'v3', auth });
      
      const googleConfig = functions.config().google;
      const devBillsCalendarId = googleConfig?.dev_bills_calendar_id;
      const devBalanceCalendarId = googleConfig?.dev_balance_calendar_id;
      const prodBillsCalendarId = googleConfig?.prod_bills_calendar_id;
      const prodBalanceCalendarId = googleConfig?.prod_balance_calendar_id;
      
      // Get current date in CST (start of today)
      const now = new Date();
      const todayCST = new Date(now.getTime() - (6 * 60 * 60 * 1000)); // UTC-6 for CST
      todayCST.setHours(0, 0, 0, 0); // Start of today
      
      // Set end date to 1 year from now (generous range)
      const oneYearFromNow = new Date(todayCST.getTime() + (365 * 24 * 60 * 60 * 1000));
      
      logger.info(`Clearing calendar events from ${todayCST.toISOString()} onwards`);
      
      let clearedCount = 0;
      let devBillsCleared = 0;
      let devBalanceCleared = 0;
      let prodBillsCleared = 0;
      let prodBalanceCleared = 0;
      
      // Helper function to handle rate limiting
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

      // Helper function to get all events with pagination and rate limiting
      async function getAllEvents(calendarId: string, calendarName: string) {
        const allEvents: any[] = [];
        let pageToken: string | undefined = undefined;
        let totalFetched = 0;
        
        do {
          const response: any = await withRateLimit(async () => {
            logger.info(`Fetching events for ${calendarName} (page ${pageToken ? 'next' : 'first'})...`);
            return await calendar.events.list({
              calendarId,
              timeMin: todayCST.toISOString(),
              timeMax: oneYearFromNow.toISOString(),
              singleEvents: true,
              maxResults: 1000, // Reduced to avoid hitting limits
              pageToken
            });
          });
          
          if (response.data.items) {
            allEvents.push(...response.data.items);
            totalFetched += response.data.items.length;
            logger.info(`Fetched ${response.data.items.length} events from ${calendarName} (total: ${totalFetched})`);
          }
          
          pageToken = response.data.nextPageToken;
          
          // Add delay between pages to avoid rate limiting
          if (pageToken) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } while (pageToken);
        
        logger.info(`Total events found in ${calendarName}: ${allEvents.length}`);
        return allEvents;
      }
      
      // Helper function to delete events in batches with aggressive rate limiting handling
      async function deleteEventsInBatches(events: any[], calendarId: string, calendarName: string) {
        let deletedCount = 0;
        const BATCH_SIZE = 5; // Smaller batches to avoid rate limits
        
        for (let i = 0; i < events.length; i += BATCH_SIZE) {
          const batch = events.slice(i, i + BATCH_SIZE);
          logger.info(`Deleting batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(events.length / BATCH_SIZE)} from ${calendarName} (${batch.length} events)`);
          
          // Process each delete sequentially to avoid overwhelming the API
          for (const event of batch) {
            if (event.id) {
              try {
                await withRateLimit(async () => {
                  await calendar.events.delete({
                    calendarId,
                    eventId: event.id
                  });
                });
                deletedCount++;
                logger.info(`Deleted ${calendarName} event: ${event.summary} (${event.start?.date})`);
              } catch (error) {
                logger.error(`Failed to delete event ${event.id} from ${calendarName}:`, error);
              }
              
              // Small delay between individual deletes
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          
          // Longer delay between batches
          if (i + BATCH_SIZE < events.length) {
            logger.info(`Completed batch ${Math.floor(i / BATCH_SIZE) + 1}, pausing before next batch...`);
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        
        return deletedCount;
      }
      
      // Always clear ALL calendars regardless of settings
      // Clear dev bills calendar
      if (devBillsCalendarId) {
        try {
          logger.info("Clearing dev bills calendar events...");
          const devBillsEvents = await getAllEvents(devBillsCalendarId, "dev bills");
          
          if (devBillsEvents.length > 0) {
            const deleted = await deleteEventsInBatches(devBillsEvents, devBillsCalendarId, "dev bills");
            clearedCount += deleted;
            devBillsCleared = deleted;
          } else {
            logger.info("No events found in dev bills calendar");
          }
        } catch (error) {
          logger.error("Error clearing dev bills calendar:", error);
        }
      }
      
      // Clear dev balance calendar
      if (devBalanceCalendarId) {
        try {
          logger.info("Clearing dev balance calendar events...");
          const devBalanceEvents = await getAllEvents(devBalanceCalendarId, "dev balance");
          
          if (devBalanceEvents.length > 0) {
            const deleted = await deleteEventsInBatches(devBalanceEvents, devBalanceCalendarId, "dev balance");
            clearedCount += deleted;
            devBalanceCleared = deleted;
          } else {
            logger.info("No events found in dev balance calendar");
          }
        } catch (error) {
          logger.error("Error clearing dev balance calendar:", error);
        }
      }
      
      // Clear prod bills calendar
      if (prodBillsCalendarId) {
        try {
          logger.info("Clearing prod bills calendar events...");
          const prodBillsEvents = await getAllEvents(prodBillsCalendarId, "prod bills");
          
          if (prodBillsEvents.length > 0) {
            const deleted = await deleteEventsInBatches(prodBillsEvents, prodBillsCalendarId, "prod bills");
            clearedCount += deleted;
            prodBillsCleared = deleted;
          } else {
            logger.info("No events found in prod bills calendar");
          }
        } catch (error) {
          logger.error("Error clearing prod bills calendar:", error);
        }
      }
      
      // Clear prod balance calendar
      if (prodBalanceCalendarId) {
        try {
          logger.info("Clearing prod balance calendar events...");
          const prodBalanceEvents = await getAllEvents(prodBalanceCalendarId, "prod balance");
          
          if (prodBalanceEvents.length > 0) {
            const deleted = await deleteEventsInBatches(prodBalanceEvents, prodBalanceCalendarId, "prod balance");
            clearedCount += deleted;
            prodBalanceCleared = deleted;
          } else {
            logger.info("No events found in prod balance calendar");
          }
        } catch (error) {
          logger.error("Error clearing prod balance calendar:", error);
        }
      }
      
      await db.collection('admin').doc('functionTimestamps').set({
        clearCalendars: new Date()
      }, { merge: true });
      
      res.status(200).json({
        success: true,
        message: `Calendar clear completed. Cleared ${clearedCount} total events (${devBillsCleared} dev bills, ${devBalanceCleared} dev balance, ${prodBillsCleared} prod bills, ${prodBalanceCleared} prod balance).`,
        clearedCount,
        devBillsCleared,
        devBalanceCleared,
        prodBillsCleared,
        prodBalanceCleared,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error("Error clearing calendars:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);