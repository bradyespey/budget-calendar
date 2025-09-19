import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";
import { google } from "googleapis";

const db = getFirestore();
const region = 'us-central1';

async function getCalendarAuth() {
  const calendarKey = functions.config().calendar?.key;
  if (!calendarKey) {
    throw new Error('Calendar key not configured');
  }

  const keyData = JSON.parse(Buffer.from(calendarKey, 'base64').toString());
  
  const auth = new google.auth.GoogleAuth({
    credentials: keyData,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return auth;
}

export const clearCalendars = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      const auth = await getCalendarAuth();
      const calendar = google.calendar({ version: 'v3', auth });
      
      const calendarConfig = functions.config().calendar;
      const devCalendarId = calendarConfig?.dev_id;
      const prodCalendarId = calendarConfig?.prod_id;
      
      let clearedCount = 0;
      
      // Clear dev calendar
      if (devCalendarId) {
        try {
          const devEvents = await calendar.events.list({
            calendarId: devCalendarId,
            q: 'Budget Projection'
          });
          
          if (devEvents.data.items && devEvents.data.items.length > 0) {
            for (const event of devEvents.data.items) {
              if (event.id) {
                await calendar.events.delete({
                  calendarId: devCalendarId,
                  eventId: event.id
                });
                clearedCount++;
              }
            }
          }
        } catch (error) {
          logger.error("Error clearing dev calendar:", error);
        }
      }
      
      // Clear prod calendar
      if (prodCalendarId) {
        try {
          const prodEvents = await calendar.events.list({
            calendarId: prodCalendarId,
            q: 'Budget Projection'
          });
          
          if (prodEvents.data.items && prodEvents.data.items.length > 0) {
            for (const event of prodEvents.data.items) {
              if (event.id) {
                await calendar.events.delete({
                  calendarId: prodCalendarId,
                  eventId: event.id
                });
                clearedCount++;
              }
            }
          }
        } catch (error) {
          logger.error("Error clearing prod calendar:", error);
        }
      }
      
      await db.collection('admin').doc('functionTimestamps').set({
        clearCalendars: new Date()
      }, { merge: true });
      
      return {
        success: true,
        message: `Calendar clear completed. Cleared ${clearedCount} events.`,
        clearedCount,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error("Error clearing calendars:", error);
      throw new functions.https.HttpsError('internal', 'Calendar clear failed');
    }
  }
);
