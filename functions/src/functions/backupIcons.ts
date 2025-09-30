import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

export const backupIcons = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      const billsSnapshot = await db.collection('bills').where('iconUrl', '!=', null).get();
      const bills = billsSnapshot.docs.map(doc => ({
        id: doc.id,
        iconUrl: doc.data().iconUrl,
        iconType: doc.data().iconType,
        name: doc.data().name
      }));
      
      if (bills.length > 0) {
        await db.collection('admin').doc('iconBackup').set({
          icons: bills,
          createdAt: new Date(),
          count: bills.length
        });
      }
      
      await db.collection('admin').doc('functionTimestamps').set({
        backupIcons: new Date()
      }, { merge: true });
      
      return {
        success: true,
        message: `Backed up ${bills.length} icons.`,
        backupCount: bills.length,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error("Error backing up icons:", error);
      throw new functions.https.HttpsError('internal', 'Icon backup failed');
    }
  }
);
