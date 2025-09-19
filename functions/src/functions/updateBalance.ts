import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

export const updateBalance = functions.region(region).https.onRequest(
  async (req, res) => {
    try {
      const apiAuth = functions.config().api?.auth;
      if (!apiAuth) {
        res.status(500).json({ error: 'API_AUTH not configured' });
        return;
      }
      
      const response = await fetch('https://api.theespeys.com/chase_balance', {
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
        updateBalance: new Date()
      }, { merge: true });
      
      res.status(200).json({ 
        success: true, 
        message: "Balance updated successfully",
        data: result,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error("Error updating balance:", error);
      res.status(500).json({ 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);
