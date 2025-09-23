import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const region = 'us-central1';

// Helper function to map Monarch categories to our categories
function mapMonarchCategory(monarchCategory: string, merchantName?: string): string {
  // Credit card payment mapping - check merchant name first
  const creditCardMerchants = [
    'Chase Southwest Credit Card',
    'Amazon Prime Credit', 
    'American Express Credit',
    'Apple Card',
    'Chase Freedom - Brady',
    'Chase Freedom - Jenny',
    'Capital One Credit - Brady',
    'PayPal Credit',
    'PECU Credit Card'
  ];
  
  if (merchantName && creditCardMerchants.includes(merchantName)) {
    return 'Credit Card Payment';
  }
  
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

export const refreshTransactions = functions.region(region).https.onRequest(
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    try {
      const monarchToken = functions.config().monarch?.token;
      if (!monarchToken) {
        res.status(500).json({ error: 'Monarch token not configured' });
        return;
      }

      const monarchApiUrl = "https://api.monarchmoney.com/graphql";
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Token ${monarchToken}`,
      };

      // Get existing Monarch bills for comparison
      const existingSnapshot = await admin.firestore().collection('bills').where('source', '==', 'monarch').get();
      const existingBills = new Map();
      existingSnapshot.docs.forEach(doc => {
        const data = doc.data();
        existingBills.set(data.streamId, { id: doc.id, ...data });
      });

      const recurringQuery = `
        query Web_GetAllRecurringTransactionItems($filters: RecurringTransactionFilter, $includeLiabilities: Boolean) {
          recurringTransactionStreams(
            filters: $filters
            includeLiabilities: $includeLiabilities
          ) {
            stream {
              id
              frequency
              isActive
              isApproximate
              name
              logoUrl
              merchant {
                id
                name
                __typename
              }
              __typename
            }
            nextForecastedTransaction {
              date
              amount
              __typename
            }
            category {
              id
              name
              icon
              group {
                id
                name
                __typename
              }
              __typename
            }
            account {
              id
              displayName
              icon
              logoUrl
              type {
                name
                __typename
              }
              subtype {
                name
                __typename
              }
              institution {
                id
                name
                __typename
              }
              __typename
            }
            __typename
          }
        }
      `;

      const response = await fetch(monarchApiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          operationName: "Web_GetAllRecurringTransactionItems",
          query: recurringQuery,
          variables: {
            filters: {},
            includeLiabilities: true
          }
        }),
      });

      if (!response.ok) {
        res.status(500).json({ error: `Monarch API error: ${response.status}` });
        return;
      }

      const result = await response.json();
      
      if (result.errors) {
        res.status(500).json({ error: 'GraphQL errors', details: result.errors });
        return;
      }

      const streams = result.data?.recurringTransactionStreams || [];
      const storeBatch = admin.firestore().batch();
      let storedCount = 0;

      for (const item of streams) {
        if (!item.stream?.id || !item.nextForecastedTransaction) continue;

        const stream = item.stream;
        const nextTransaction = item.nextForecastedTransaction;

        // Convert to bills format with enhanced data
        const billData = {
          name: stream.name || 'Unknown',
          amount: nextTransaction.amount || 0, // Preserve original sign from Monarch
          category: mapMonarchCategory(item.category?.name || 'Other', stream.name),
          frequency: stream.frequency || 'monthly',
          startDate: nextTransaction.date || new Date().toISOString().split('T')[0], // Use nextForecastedTransaction date
          endDate: null,
          repeatsEvery: 1,
          notes: null, // Don't save notes for Monarch transactions
          source: 'monarch',
          streamId: stream.id,
          // Account data
          accountName: item.account?.displayName || 'Unknown Account',
          accountIcon: item.account?.icon || 'dollar-sign',
          accountType: item.account?.type?.name || null,
          accountSubtype: item.account?.subtype?.name || null,
          institutionName: item.account?.institution?.name || null,
          institutionId: item.account?.institution?.id || null,
          // Icon data
          logoUrl: stream.logoUrl || null, // Monarch merchant logo
          merchantName: stream.merchant?.name || null,
          merchantId: stream.merchant?.id || null,
          // Category data
          categoryIcon: mapMonarchCategory(item.category?.name || 'Other', stream.name) === 'Credit Card Payment' ? '💳' : (item.category?.icon || '📄'),
          categoryGroup: item.category?.group?.name || null,
          categoryGroupId: item.category?.group?.id || null,
          // Metadata
          isActive: stream.isActive !== false,
          isApproximate: stream.isApproximate || false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Check if this bill already exists and needs updating
        const existingBill = existingBills.get(stream.id);
        
        if (existingBill) {
          // Compare key fields to see if update is needed
          const needsUpdate = (
            existingBill.name !== billData.name ||
            existingBill.amount !== billData.amount ||
            existingBill.category !== billData.category ||
            existingBill.frequency !== billData.frequency ||
            existingBill.startDate !== billData.startDate ||
            existingBill.accountName !== billData.accountName ||
            existingBill.isActive !== billData.isActive
          );
          
          if (needsUpdate) {
            // Update existing bill
            const docRef = admin.firestore().collection('bills').doc(existingBill.id);
            storeBatch.update(docRef, billData);
            logger.info(`Updating bill for ${stream.name} (${stream.id})`);
          }
          
          // Mark as processed
          existingBills.delete(stream.id);
        } else {
          // Create new bill
          const newBillData = {
            ...billData,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          };
          const docRef = admin.firestore().collection('bills').doc();
          storeBatch.set(docRef, newBillData);
          logger.info(`Creating new bill for ${stream.name} (${stream.id})`);
        }
        
        storedCount++;
      }

      await storeBatch.commit();

      // Delete bills that no longer exist in Monarch
      const deleteBatch = admin.firestore().batch();
      let deletedCount = 0;
      
      for (const [streamId, bill] of existingBills) {
        logger.info(`Deleting bill for ${bill.name} (${streamId}) - no longer in Monarch`);
        const docRef = admin.firestore().collection('bills').doc(bill.id);
        deleteBatch.delete(docRef);
        deletedCount++;
      }
      
      if (deletedCount > 0) {
        await deleteBatch.commit();
      }

      res.status(200).json({
        success: true,
        message: 'Recurring transactions refreshed successfully',
        count: storedCount,
        deleted: deletedCount,
        updatedAt: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Refresh recurring transactions error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
      });
    }
  }
);
