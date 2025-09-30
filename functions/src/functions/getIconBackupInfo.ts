import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = admin.firestore();
const region = 'us-central1';

export const getIconBackupInfo = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      logger.info('Getting icon backup info');

      // Get the latest backup info from Firestore
      const backupRef = db.collection('admin').doc('iconBackup');
      const backupDoc = await backupRef.get();

      if (!backupDoc.exists) {
        return {
          success: true,
          hasBackup: false,
          message: 'No backup found'
        };
      }

      const backupData = backupDoc.data();
      
      return {
        success: true,
        hasBackup: true,
        backupCount: backupData?.count || 0,
        timestamp: backupData?.createdAt?.toDate?.()?.toISOString() || null,
        message: `Backup from ${backupData?.createdAt ? backupData.createdAt.toDate().toLocaleString() : 'unknown time'} with ${backupData?.count || 0} icons`
      };

    } catch (error: any) {
      logger.error('Error getting backup info:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get backup info',
        error.message
      );
    }
  }
);
