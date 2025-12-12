import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('Error: FIREBASE_SERVICE_ACCOUNT environment variable is missing.');
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Collections to backup
const COLLECTIONS = [
  'accounts',
  'bills',
  'categories',
  'projections',
  'recurringTransactions',
  'settings',
  'admin',
  'monthlyCashFlow'
];

async function backupCollection(collectionName) {
  console.log(`Backing up ${collectionName}...`);
  const collectionRef = db.collection(collectionName);
  const snapshot = await collectionRef.get();
  
  const data = [];
  snapshot.forEach(doc => {
    // Store doc ID inside the data for complete restoration capability
    data.push({ id: doc.id, ...doc.data() });
  });

  // Sort by id for consistent file ordering (minimizes git diff noise)
  data.sort((a, b) => a.id.localeCompare(b.id));

  console.log(`  Found ${data.length} documents in ${collectionName}`);
  return data;
}

async function backup() {
  console.log('Starting backup...');
  
  // Create backups directory if it doesn't exist
  const backupDir = path.join(__dirname, '../data-backups');
  if (!fs.existsSync(backupDir)){
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupData = {};
  let totalDocs = 0;

  // Backup each collection
  for (const collection of COLLECTIONS) {
    try {
      const data = await backupCollection(collection);
      backupData[collection] = data;
      totalDocs += data.length;
    } catch (error) {
      console.error(`Error backing up ${collection}:`, error.message);
      // Continue with other collections even if one fails
      backupData[collection] = [];
    }
  }

  // Write backup file with timestamp
  const timestamp = new Date().toISOString().split('T')[0];
  const filePath = path.join(backupDir, 'budget-data.json');
  
  const backupOutput = {
    timestamp: new Date().toISOString(),
    collections: backupData,
    metadata: {
      totalCollections: COLLECTIONS.length,
      totalDocuments: totalDocs,
      backupDate: timestamp
    }
  };

  fs.writeFileSync(filePath, JSON.stringify(backupOutput, null, 2));
  
  console.log(`\nBackup complete!`);
  console.log(`Total collections: ${COLLECTIONS.length}`);
  console.log(`Total documents: ${totalDocs}`);
  console.log(`Saved to: ${filePath}`);
}

backup().catch(error => {
  console.error('Backup failed:', error);
  process.exit(1);
});

