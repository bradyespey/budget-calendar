import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

export const restoreIcons = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      const backupDoc = await db.collection('admin').doc('iconBackup').get();
      
      if (!backupDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'No icon backup found');
      }
      
      const backup = backupDoc.data();
      const icons = backup?.icons || [];
      
      let iconsRestored = 0;
      
      for (const iconData of icons) {
        try {
          await db.collection('bills').doc(iconData.id).update({
            icon: iconData.icon
          });
          iconsRestored++;
          
        } catch (error) {
          logger.error(`Error restoring icon for bill ${iconData.id}:`, error);
        }
      }
      
      await db.collection('admin').doc('functionTimestamps').set({
        restoreIcons: new Date()
      }, { merge: true });
      
      return {
        success: true,
        message: `Restored ${iconsRestored} icons.`,
        iconsRestored,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error("Error restoring icons:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', 'Icon restore failed');
    }
  }
);
