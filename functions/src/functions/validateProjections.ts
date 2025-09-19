import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

export const validateProjections = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      const projectionsSnapshot = await db.collection('projections').get();
      const projections = projectionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      
      const errors: string[] = [];
      
      projections.forEach(projection => {
        if (!projection.projDate) {
          errors.push(`Projection missing date`);
        }
        if (typeof projection.projectedBalance !== 'number') {
          errors.push(`Projection ${projection.projDate} has invalid balance`);
        }
      });
      
      return {
        isValid: errors.length === 0,
        errors,
        projectionsCount: projections.length,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error("Error validating projections:", error);
      throw new functions.https.HttpsError('internal', 'Validation failed');
    }
  }
);
