// Script to clean up duplicate savings history entries
// Run with: node cleanup-savings-duplicates.js

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync('./serviceAccountKey.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanupDuplicates() {
  console.log('Starting cleanup of duplicate savings history entries...\n');
  
  try {
    // Get all savings history entries
    const snapshot = await db.collection('savingsHistory')
      .orderBy('timestamp', 'asc')
      .get();
    
    console.log(`Found ${snapshot.docs.length} total entries\n`);
    
    // Group by balance value
    const groupedByBalance = {};
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const balance = data.balance;
      
      if (!groupedByBalance[balance]) {
        groupedByBalance[balance] = [];
      }
      groupedByBalance[balance].push({ id: doc.id, ...data });
    });
    
    console.log(`Found ${Object.keys(groupedByBalance).length} unique balance values\n`);
    
    // For each balance, keep only the latest entry
    let deletedCount = 0;
    const batch = db.batch();
    
    Object.entries(groupedByBalance).forEach(([balance, entries]) => {
      if (entries.length > 1) {
        // Sort by timestamp descending to keep the latest
        entries.sort((a, b) => b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime());
        
        // Delete all except the first (latest) entry
        const toDelete = entries.slice(1);
        console.log(`Balance $${balance}: Keeping latest entry from ${entries[0].timestamp.toDate().toLocaleString()}, deleting ${toDelete.length} duplicates`);
        
        toDelete.forEach(entry => {
          batch.delete(db.collection('savingsHistory').doc(entry.id));
          deletedCount++;
        });
      }
    });
    
    if (deletedCount > 0) {
      await batch.commit();
      console.log(`\n✅ Successfully deleted ${deletedCount} duplicate entries`);
      console.log(`Remaining entries: ${snapshot.docs.length - deletedCount}`);
    } else {
      console.log('\n✅ No duplicates found!');
    }
    
  } catch (error) {
    console.error('❌ Error cleaning up:', error);
  } finally {
    process.exit(0);
  }
}

cleanupDuplicates();
