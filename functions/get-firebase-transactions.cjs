const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  console.log('🚀 Getting transaction data from Firebase...');
  
  try {
    // Get all bills from Firebase
    const billsSnapshot = await db.collection('bills').get();
    const bills = [];
    
    billsSnapshot.forEach(doc => {
      bills.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`✅ Found ${bills.length} bills in Firebase`);
    
    // Show all transaction names
    console.log(`\n📋 ALL TRANSACTION NAMES IN FIREBASE:`);
    console.log('─'.repeat(60));
    bills.forEach((bill, index) => {
      console.log(`${(index + 1).toString().padStart(3)}. "${bill.name}"`);
      console.log(`     Amount: ${bill.amount || 'N/A'}`);
      console.log(`     Frequency: ${bill.frequency}`);
      console.log(`     Source: ${bill.source}`);
      console.log(`     Logo URL: ${bill.logoUrl || 'None'}`);
      console.log(`     Category Icon: ${bill.categoryIcon || 'None'}`);
      console.log('');
    });
    
    // Target transactions to find
    const targets = ['Generator Athlete Lab', 'Amazon Prime Credit', 'Clear', 'Apple Card', 'Living Security'];
    
    console.log(`\n🎯 TARGET TRANSACTIONS ANALYSIS:`);
    console.log('─'.repeat(60));
    
    targets.forEach(targetName => {
      const match = bills.find(bill => {
        const billName = bill.name.toLowerCase();
        const target = targetName.toLowerCase();
        return billName.includes(target) || 
               target.includes(billName) ||
               billName.includes('generator') && target.includes('generator') ||
               billName.includes('amazon') && target.includes('amazon') ||
               billName.includes('clear') && target.includes('clear') ||
               billName.includes('apple') && target.includes('apple') ||
               billName.includes('living') && target.includes('living');
      });
      
      if (match) {
        console.log(`\n✅ FOUND: "${targetName}"`);
        console.log(`   Actual name: "${match.name}"`);
        console.log(`   Amount: ${match.amount || 'N/A'}`);
        console.log(`   Frequency: ${match.frequency}`);
        console.log(`   Source: ${match.source}`);
        console.log(`   Logo URL: ${match.logoUrl || 'None'}`);
        console.log(`   Category Icon: ${match.categoryIcon || 'None'}`);
        console.log(`   Merchant Name: ${match.merchantName || 'None'}`);
        console.log(`   Category Group: ${match.categoryGroup || 'None'}`);
        console.log(`   Account Type: ${match.accountType || 'None'}`);
        console.log(`   Institution: ${match.institutionName || 'None'}`);
        
        console.log(`\n📊 COMPLETE RAW DATA:`);
        console.log(JSON.stringify(match, null, 2));
      } else {
        console.log(`❌ Could not find: "${targetName}"`);
      }
    });
    
    // Show summary of all available fields
    console.log(`\n📊 SUMMARY: ALL UNIQUE FIELDS ACROSS ALL BILLS`);
    console.log('─'.repeat(60));
    
    const allFields = new Set();
    bills.forEach(bill => {
      Object.keys(bill).forEach(field => allFields.add(field));
    });
    
    const sortedFields = Array.from(allFields).sort();
    console.log(`\n📋 Total unique fields found: ${sortedFields.length}`);
    sortedFields.forEach(field => {
      console.log(`  - ${field}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    admin.app().delete();
  }
}

// Run the analysis
main().catch(console.error);
