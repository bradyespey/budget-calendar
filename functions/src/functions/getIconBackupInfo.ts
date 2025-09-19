import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";
import { db, region } from '../index';

export const getIconBackupInfo = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      // Check if user is authenticated
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated to access backup info'
        );
      }

      logger.info('Getting icon backup info');

      // Get the latest backup info from Firestore
      const backupRef = db.collection('iconBackups').doc('latest');
      const backupDoc = await backupRef.get();

      if (!backupDoc.exists) {
        return {
          exists: false,
          message: 'No backup found'
        };
      }

      const backupData = backupDoc.data();
      
      return {
        exists: true,
        timestamp: backupData?.timestamp || null,
        count: backupData?.count || 0,
        message: `Backup from ${backupData?.timestamp ? new Date(backupData.timestamp.seconds * 1000).toLocaleString() : 'unknown time'} with ${backupData?.count || 0} icons`
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
