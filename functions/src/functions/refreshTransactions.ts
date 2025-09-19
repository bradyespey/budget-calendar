import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const region = 'us-central1';

export const refreshTransactions = functions.region(region).https.onRequest(
  async (req, res) => {
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

      // Clear existing data
      const existingSnapshot = await admin.firestore().collection('recurringTransactions').get();
      const batch = admin.firestore().batch();
      existingSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

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
              __typename
            }
            account {
              id
              displayName
              icon
              logoUrl
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

        const docData = {
          streamId: stream.id,
          merchantName: stream.name || 'Unknown',
          frequency: stream.frequency || 'monthly',
          amount: nextTransaction.amount || 0,
          nextDueDate: nextTransaction.date || null,
          categoryName: item.category?.name || 'Uncategorized',
          categoryIcon: item.category?.icon || '📄',
          accountName: item.account?.displayName || 'Unknown Account',
          accountIcon: item.account?.icon || 'dollar-sign',
          logoUrl: stream.logoUrl || null,
          isActive: stream.isActive !== false,
          isApproximate: stream.isApproximate || false,
          source: 'monarch',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = admin.firestore().collection('recurringTransactions').doc();
        storeBatch.set(docRef, docData);
        storedCount++;
      }

      await storeBatch.commit();

      res.status(200).json({
        success: true,
        message: 'Recurring transactions refreshed successfully',
        count: storedCount,
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
