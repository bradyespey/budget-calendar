import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

export const resetAllIcons = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      const { preserveCustom = false } = data || {};
      
      let billsSnapshot;
      
      // If preserving custom icons, only reset non-custom icons
      if (preserveCustom) {
        billsSnapshot = await db.collection('bills').where('iconType', '!=', 'custom').get();
      } else {
        billsSnapshot = await db.collection('bills').get();
      }
      
      const bills = billsSnapshot.docs;
      
      let resetCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      
      for (const billDoc of bills) {
        try {
          const billData = billDoc.data();
          
          // Skip if preserving custom icons and this is a custom icon
          if (preserveCustom && billData.iconType === 'custom') {
            skippedCount++;
            continue;
          }
          
          await billDoc.ref.update({
            iconUrl: null,
            iconType: null
          });
          resetCount++;
          
        } catch (error) {
          logger.error(`Error resetting bill ${billDoc.id}:`, error);
          errorCount++;
        }
      }
      
      await db.collection('admin').doc('functionTimestamps').set({
        resetAllIcons: new Date()
      }, { merge: true });
      
      return {
        success: true,
        message: `Reset ${resetCount} icons${preserveCustom ? ' (preserving custom icons)' : ''}.`,
        resetCount,
        skippedCount,
        errorCount,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error("Error resetting icons:", error);
      throw new functions.https.HttpsError('internal', 'Icon reset failed');
    }
  }
);
