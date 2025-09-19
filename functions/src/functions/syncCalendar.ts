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

export const syncCalendar = functions.region(region).https.onRequest(
  async (req, res) => {
    try {
      const env = req.body?.env || 'dev';
      
      const auth = await getCalendarAuth();
      const calendar = google.calendar({ version: 'v3', auth });
      
      const calendarConfig = functions.config().calendar;
      const calendarId = env === 'prod' ? calendarConfig?.prod_id : calendarConfig?.dev_id;
      
      if (!calendarId) {
        throw new Error(`Calendar ID not configured for environment: ${env}`);
      }
      
      const projectionsSnapshot = await db.collection('projections').get();
      const projections = projectionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      
      // Clear existing events
      const now = new Date();
      const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      try {
        const existingEvents = await calendar.events.list({
          calendarId: calendarId,
          timeMin: now.toISOString(),
          timeMax: oneWeekFromNow.toISOString(),
          q: 'Budget Projection'
        });
        
        if (existingEvents.data.items && existingEvents.data.items.length > 0) {
          for (const event of existingEvents.data.items) {
            if (event.id) {
              await calendar.events.delete({
                calendarId: calendarId,
                eventId: event.id
              });
            }
          }
        }
      } catch (error) {
        logger.warn("Error clearing existing events:", error);
      }
      
      // Create new events
      let eventsCreated = 0;
      
      for (const projection of projections) {
        try {
          const event = {
            summary: `Budget Projection: $${projection.projectedBalance.toFixed(2)}`,
            description: `Projected balance: $${projection.projectedBalance.toFixed(2)}\nBills due: ${projection.bills?.length || 0}`,
            start: {
              date: projection.projDate
            },
            end: {
              date: projection.projDate
            },
            colorId: projection.lowest ? '11' : projection.highest ? '5' : '1'
          };
          
          await calendar.events.insert({
            calendarId: calendarId,
            requestBody: event
          });
          
          eventsCreated++;
          
        } catch (error) {
          logger.error(`Error creating event for ${projection.projDate}:`, error);
        }
      }
      
      await db.collection('admin').doc('functionTimestamps').set({
        syncCalendar: new Date()
      }, { merge: true });
      
      res.status(200).json({
        success: true,
        message: `Calendar sync completed. Created ${eventsCreated} events.`,
        eventsCreated,
        environment: env,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error("Error syncing calendar:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);
