import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const cleanupSavingsHistory = functions.https.onRequest(async (req, res) => {
  try {
    console.log('Starting savings history cleanup...');
    
    // Get all savings history entries
    const snapshot = await db.collection('savingsHistory')
      .orderBy('timestamp', 'asc')
      .get();
    
    console.log(`Found ${snapshot.docs.length} total entries`);
    
    // Group by date and balance
    const groupedEntries: { [key: string]: admin.firestore.DocumentSnapshot[] } = {};
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const date = new Date(data.timestamp.toDate());
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const balanceKey = `${dateKey}-${data.balance}`;
      
      if (!groupedEntries[balanceKey]) {
        groupedEntries[balanceKey] = [];
      }
      groupedEntries[balanceKey].push(doc);
    });
    
    console.log(`Grouped into ${Object.keys(groupedEntries).length} unique date-balance combinations`);
    
    // For each group, keep only the latest entry and delete the rest
    const batch = db.batch();
    let deletedCount = 0;
    
    Object.values(groupedEntries).forEach(group => {
      if (group.length > 1) {
        // Sort by timestamp descending to keep the latest
        group.sort((a, b) => {
          const aTime = a.data()?.timestamp?.toDate()?.getTime() || 0;
          const bTime = b.data()?.timestamp?.toDate()?.getTime() || 0;
          return bTime - aTime;
        });
        
        // Delete all except the first (latest) entry
        const toDelete = group.slice(1);
        toDelete.forEach(doc => {
          if (doc.ref) {
            batch.delete(doc.ref);
            deletedCount++;
          }
        });
        
        const firstDoc = group[0];
        if (firstDoc) {
          const data = firstDoc.data();
          const balance = data?.balance || 'unknown';
          const date = data?.timestamp?.toDate()?.toDateString() || 'unknown date';
          console.log(`Will delete ${toDelete.length} duplicates for balance ${balance} on ${date}`);
        }
      }
    });
    
    if (deletedCount > 0) {
      await batch.commit();
      console.log(`Successfully deleted ${deletedCount} duplicate entries`);
      
      res.status(200).json({
        success: true,
        message: `Cleaned up ${deletedCount} duplicate savings history entries`,
        totalEntries: snapshot.docs.length,
        deletedEntries: deletedCount,
        remainingEntries: snapshot.docs.length - deletedCount
      });
    } else {
      console.log('No duplicates found');
      res.status(200).json({
        success: true,
        message: 'No duplicate entries found',
        totalEntries: snapshot.docs.length
      });
    }
    
  } catch (error) {
    console.error('Error cleaning up savings history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup savings history',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
