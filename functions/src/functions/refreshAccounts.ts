import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

export const refreshAccounts = functions.region(region).https.onRequest(
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

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
      
      const response = await fetch('https://api.theespeys.com/refresh_accounts', {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(apiAuth).toString('base64')}`
        }
      });
      
      if (!response.ok) {
        res.status(500).json({ error: `API error: ${response.status}` });
        return;
      }
      
      const result = await response.json();
      
      await db.collection('admin').doc('functionTimestamps').set({
        refreshAccounts: new Date()
      }, { merge: true });
      
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
