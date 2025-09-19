import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

export const resetAllIcons = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      const billsSnapshot = await db.collection('bills').get();
      const bills = billsSnapshot.docs;
      
      let iconsReset = 0;
      
      for (const billDoc of bills) {
        try {
          await billDoc.ref.update({
            icon: null
          });
          iconsReset++;
          
        } catch (error) {
          logger.error(`Error resetting bill ${billDoc.id}:`, error);
        }
      }
      
      await db.collection('admin').doc('functionTimestamps').set({
        resetAllIcons: new Date()
      }, { merge: true });
      
      return {
        success: true,
        message: `Reset ${iconsReset} icons.`,
        iconsReset,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error("Error resetting icons:", error);
      throw new functions.https.HttpsError('internal', 'Icon reset failed');
    }
  }
);
