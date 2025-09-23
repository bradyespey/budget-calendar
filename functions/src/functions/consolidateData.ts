import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const db = getFirestore();
const region = 'us-central1';

export const consolidateData = functions.region(region).https.onCall(
  async (data, context) => {
    try {
      logger.info("Starting data consolidation...");
      
      // Get all existing manual bills
      const billsSnapshot = await db.collection('bills').get();
      const manualBills = billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      logger.info(`Found ${manualBills.length} manual bills`);
      
      // Get all Monarch recurring transactions
      const recurringSnapshot = await db.collection('recurringTransactions').get();
      const monarchTransactions = recurringSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      logger.info(`Found ${monarchTransactions.length} Monarch transactions`);
      
      // Clear old tables
      const batch = db.batch();
      
      // Delete old recurringTransactions
      const recurringDocs = await db.collection('recurringTransactions').get();
      recurringDocs.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Delete old recurring_transactions if it exists
      const recurringOldDocs = await db.collection('recurring_transactions').get();
      recurringOldDocs.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      logger.info("Cleared old transaction tables");
      
      // Add Monarch transactions to bills collection with source flag
      const addBatch = db.batch();
      let addedCount = 0;
      
      for (const transaction of monarchTransactions) {
        // Convert Monarch transaction to bill format
        const transactionData = transaction as any; // Type assertion for flexibility
        const billData = {
          name: transactionData.merchantName || transactionData.name || 'Unknown',
          amount: -(transactionData.amount || 0), // Make expenses negative
          category: mapMonarchCategory(transactionData.categoryName || 'Other'),
          frequency: transactionData.frequency || 'monthly',
          startDate: transactionData.nextDueDate || new Date().toISOString().split('T')[0],
          endDate: null,
          repeatsEvery: 1,
          note: `Imported from Monarch: ${transactionData.streamId || ''}`,
          source: 'monarch',
          streamId: transactionData.streamId,
          accountName: transactionData.accountName,
          isActive: transactionData.isActive !== false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        const docRef = db.collection('bills').doc();
        addBatch.set(docRef, billData);
        addedCount++;
      }
      
      await addBatch.commit();
      logger.info(`Added ${addedCount} Monarch transactions to bills collection`);
      
      return {
        success: true,
        message: `Consolidation complete. Processed ${manualBills.length} manual bills and ${addedCount} Monarch transactions.`,
        details: {
          manualBillsCount: manualBills.length,
          monarchTransactionsAdded: addedCount,
          clearedTables: ['recurringTransactions', 'recurring_transactions']
        }
      };
      
    } catch (error) {
      logger.error("Error in data consolidation:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
);

// Helper function to map Monarch categories to our categories
function mapMonarchCategory(monarchCategory: string): string {
  const categoryMap: { [key: string]: string } = {
    'subscription': 'Streaming',
    'food & drinks': 'Food & Drinks',
    'travel': 'Travel',
    'other': 'Other',
    'golf': 'Golf',
    'paycheck': 'Paycheck'
  };
  
  const normalized = monarchCategory.toLowerCase();
  return categoryMap[normalized] || monarchCategory;
}
