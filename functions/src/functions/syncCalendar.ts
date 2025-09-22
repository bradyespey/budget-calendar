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

export const syncCalendar = functions.region(region).https.onRequest(
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
      
      const auth = await getCalendarAuth();
      const calendar = google.calendar({ version: 'v3', auth });
      
      const googleConfig = functions.config().google;
      const billsCalendarId = env === 'prod' ? googleConfig?.prod_bills_calendar_id : googleConfig?.dev_bills_calendar_id;
      const balanceCalendarId = env === 'prod' ? googleConfig?.prod_balance_calendar_id : googleConfig?.dev_balance_calendar_id;
      
      if (!billsCalendarId || !balanceCalendarId) {
        throw new Error(`Calendar IDs not configured for environment: ${env}`);
      }
      
      // Get all projections from database
      const projectionsSnapshot = await db.collection('projections').get();
      const projections = projectionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      
      logger.info(`Found ${projections.length} projections to sync`);
      
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
      
      // Process each projection date
      for (const projection of projections) {
        const projDate = projection.projDate;
        
        // 1. Create/update individual bill events in bills calendar (yellow)
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
            
            try {
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
            } catch (error) {
              logger.error(`Error processing bill event ${billSummary} for ${projDate}:`, error);
            }
          }
        }
        
        // 2. Create/update budget projection event in balance calendar (pink)
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
        
        try {
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
        } catch (error) {
          logger.error(`Error processing balance event for ${projDate}:`, error);
        }
      }
      
      // Delete any remaining outdated events
      // Delete outdated bill events
      for (const [key, event] of existingBillEventsByDateAndName) {
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
      }
      
      // Delete outdated balance events
      for (const [date, event] of existingBalanceEventsByDate) {
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
      }
      
      await db.collection('admin').doc('functionTimestamps').set({
        syncCalendar: new Date()
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
      logger.error("Error syncing calendar:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);
