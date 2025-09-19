import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

export const generateIcons = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      const billsSnapshot = await db.collection('bills').get();
      const bills = billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      
      let iconsGenerated = 0;
      
      for (const bill of bills) {
        try {
          let icon = '💰'; // default icon
          
          const name = bill.name?.toLowerCase() || '';
          const category = bill.category?.toLowerCase() || '';
          
          if (name.includes('rent') || category.includes('rent')) {
            icon = '🏠';
          } else if (name.includes('food') || name.includes('grocery') || category.includes('food')) {
            icon = '🍎';
          } else if (name.includes('gas') || name.includes('fuel')) {
            icon = '⛽';
          } else if (name.includes('phone') || name.includes('mobile')) {
            icon = '📱';
          } else if (name.includes('internet') || name.includes('wifi')) {
            icon = '🌐';
          } else if (name.includes('electric') || name.includes('power')) {
            icon = '⚡';
          } else if (name.includes('water')) {
            icon = '💧';
          } else if (name.includes('insurance')) {
            icon = '🛡️';
          } else if (name.includes('gym') || name.includes('fitness')) {
            icon = '💪';
          } else if (name.includes('streaming') || name.includes('netflix') || name.includes('spotify')) {
            icon = '📺';
          }
          
          await db.collection('bills').doc(bill.id).update({ icon });
          iconsGenerated++;
          
        } catch (error) {
          logger.error(`Error processing bill ${bill.id}:`, error);
        }
      }
      
      await db.collection('admin').doc('functionTimestamps').set({
        generateIcons: new Date()
      }, { merge: true });
      
      return {
        success: true,
        message: `Generated ${iconsGenerated} icons.`,
        iconsGenerated,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error("Error generating icons:", error);
      throw new functions.https.HttpsError('internal', 'Icon generation failed');
    }
  }
);
