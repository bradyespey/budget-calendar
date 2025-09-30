import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

export const refreshAccounts = functions.region(region).https.onRequest(
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      const apiAuth = functions.config().api?.auth;
      if (!apiAuth) {
        res.status(500).json({ error: 'API_AUTH not configured' });
        return;
      }
      
      const response = await Promise.race([
        fetch('https://api.theespeys.com/refresh_accounts?sync=1', {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${Buffer.from(apiAuth).toString('base64')}`
          }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 3 minutes')), 180000))
      ]) as Response;
      
      if (!response.ok) {
        res.status(500).json({ error: `API error: ${response.status}` });
        return;
      }
      
      const result = await response.json();
      
      // Update function timestamp
      try {
        await db.doc('admin/functionTimestamps').set({
          refreshAccounts: Timestamp.now()
        }, { merge: true });
        logger.info('Updated refreshAccounts timestamp');
      } catch (timestampError) {
        logger.warn('Failed to update timestamp:', timestampError);
      }
      
      res.status(200).json({ 
        success: true, 
        message: "Account refresh completed",
        data: result,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error("Error refreshing accounts:", error);
      res.status(500).json({ 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);
