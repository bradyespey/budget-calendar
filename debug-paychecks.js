import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function checkPaychecks() {
  try {
    const db = admin.firestore();
    
    // Get all bills
    const billsSnapshot = await db.collection('bills').get();
    console.log(`Total bills: ${billsSnapshot.size}`);
    
    // Check for paychecks
    const paychecks = [];
    billsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.category && data.category.toLowerCase().includes('paycheck')) {
        paychecks.push({
          id: doc.id,
          name: data.name,
          category: data.category,
          frequency: data.frequency,
          startDate: data.startDate,
          amount: data.amount,
          source: data.source
        });
      }
    });
    
    console.log(`\nPaychecks found: ${paychecks.length}`);
    paychecks.forEach(paycheck => {
      console.log(`- ${paycheck.name}: ${paycheck.category}, ${paycheck.frequency}, ${paycheck.startDate}, $${paycheck.amount}`);
    });
    
    // Check projections
    const projectionsSnapshot = await db.collection('projections').get();
    console.log(`\nTotal projections: ${projectionsSnapshot.size}`);
    
    projectionsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.bills && data.bills.length > 0) {
        const paycheckBills = data.bills.filter(bill => 
          bill.category && bill.category.toLowerCase().includes('paycheck')
        );
        if (paycheckBills.length > 0) {
          console.log(`Projection ${doc.id}: ${paycheckBills.length} paycheck(s)`);
          paycheckBills.forEach(bill => {
            console.log(`  - ${bill.name}: ${bill.frequency}`);
          });
        }
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkPaychecks();
