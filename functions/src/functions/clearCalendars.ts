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

export const clearCalendars = functions.region(region).https.onRequest(
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
      
      // Always clear ALL calendars regardless of settings
      // Clear dev bills calendar
      if (devBillsCalendarId) {
        try {
          logger.info("Clearing dev bills calendar events...");
          const devBillsEvents = await calendar.events.list({
            calendarId: devBillsCalendarId,
            timeMin: todayCST.toISOString(),
            timeMax: oneYearFromNow.toISOString(),
            singleEvents: true,
            maxResults: 2500 // Google's max
          });
          
          if (devBillsEvents.data.items && devBillsEvents.data.items.length > 0) {
            logger.info(`Found ${devBillsEvents.data.items.length} events to delete in dev bills calendar`);
            
            // Delete in batches to avoid timeout
            for (let i = 0; i < devBillsEvents.data.items.length; i += 10) {
              const batch = devBillsEvents.data.items.slice(i, i + 10);
              const deletePromises = batch.map(event => {
                if (event.id) {
                  return calendar.events.delete({
                    calendarId: devBillsCalendarId,
                    eventId: event.id
                  }).then(() => {
                    clearedCount++;
                    devBillsCleared++;
                    logger.info(`Deleted dev bills event: ${event.summary} (${event.start?.date})`);
                  }).catch(err => {
                    logger.error(`Failed to delete event ${event.id}:`, err);
                  });
                }
                return Promise.resolve();
              });
              
              await Promise.allSettled(deletePromises);
              
              // Add small delay between batches
              if (i + 10 < devBillsEvents.data.items.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
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
          const devBalanceEvents = await calendar.events.list({
            calendarId: devBalanceCalendarId,
            timeMin: todayCST.toISOString(),
            timeMax: oneYearFromNow.toISOString(),
            singleEvents: true,
            maxResults: 2500 // Google's max
          });
          
          if (devBalanceEvents.data.items && devBalanceEvents.data.items.length > 0) {
            logger.info(`Found ${devBalanceEvents.data.items.length} events to delete in dev balance calendar`);
            
            // Delete in batches to avoid timeout
            for (let i = 0; i < devBalanceEvents.data.items.length; i += 10) {
              const batch = devBalanceEvents.data.items.slice(i, i + 10);
              const deletePromises = batch.map(event => {
                if (event.id) {
                  return calendar.events.delete({
                    calendarId: devBalanceCalendarId,
                    eventId: event.id
                  }).then(() => {
                    clearedCount++;
                    devBalanceCleared++;
                    logger.info(`Deleted dev balance event: ${event.summary} (${event.start?.date})`);
                  }).catch(err => {
                    logger.error(`Failed to delete event ${event.id}:`, err);
                  });
                }
                return Promise.resolve();
              });
              
              await Promise.allSettled(deletePromises);
              
              // Add small delay between batches
              if (i + 10 < devBalanceEvents.data.items.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
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
          const prodBillsEvents = await calendar.events.list({
            calendarId: prodBillsCalendarId,
            timeMin: todayCST.toISOString(),
            timeMax: oneYearFromNow.toISOString(),
            singleEvents: true,
            maxResults: 2500 // Google's max
          });
          
          if (prodBillsEvents.data.items && prodBillsEvents.data.items.length > 0) {
            logger.info(`Found ${prodBillsEvents.data.items.length} events to delete in prod bills calendar`);
            
            // Delete in batches to avoid timeout
            for (let i = 0; i < prodBillsEvents.data.items.length; i += 10) {
              const batch = prodBillsEvents.data.items.slice(i, i + 10);
              const deletePromises = batch.map(event => {
                if (event.id) {
                  return calendar.events.delete({
                    calendarId: prodBillsCalendarId,
                    eventId: event.id
                  }).then(() => {
                    clearedCount++;
                    prodBillsCleared++;
                    logger.info(`Deleted prod bills event: ${event.summary} (${event.start?.date})`);
                  }).catch(err => {
                    logger.error(`Failed to delete event ${event.id}:`, err);
                  });
                }
                return Promise.resolve();
              });
              
              await Promise.allSettled(deletePromises);
              
              // Add small delay between batches
              if (i + 10 < prodBillsEvents.data.items.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
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
          const prodBalanceEvents = await calendar.events.list({
            calendarId: prodBalanceCalendarId,
            timeMin: todayCST.toISOString(),
            timeMax: oneYearFromNow.toISOString(),
            singleEvents: true,
            maxResults: 2500 // Google's max
          });
          
          if (prodBalanceEvents.data.items && prodBalanceEvents.data.items.length > 0) {
            logger.info(`Found ${prodBalanceEvents.data.items.length} events to delete in prod balance calendar`);
            
            // Delete in batches to avoid timeout
            for (let i = 0; i < prodBalanceEvents.data.items.length; i += 10) {
              const batch = prodBalanceEvents.data.items.slice(i, i + 10);
              const deletePromises = batch.map(event => {
                if (event.id) {
                  return calendar.events.delete({
                    calendarId: prodBalanceCalendarId,
                    eventId: event.id
                  }).then(() => {
                    clearedCount++;
                    prodBalanceCleared++;
                    logger.info(`Deleted prod balance event: ${event.summary} (${event.start?.date})`);
                  }).catch(err => {
                    logger.error(`Failed to delete event ${event.id}:`, err);
                  });
                }
                return Promise.resolve();
              });
              
              await Promise.allSettled(deletePromises);
              
              // Add small delay between batches
              if (i + 10 < prodBalanceEvents.data.items.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
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