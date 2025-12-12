import admin from 'firebase-admin';

// Initialize Firebase Admin
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('Error: FIREBASE_SERVICE_ACCOUNT environment variable is missing.');
  process.exit(1);
}

const firebaseServiceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Initialize Firebase (includes Firestore and Storage)
admin.initializeApp({
  credential: admin.credential.cert(firebaseServiceAccount),
  storageBucket: `${firebaseServiceAccount.project_id}.appspot.com`
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// Project-specific settings
const PROJECT_NAME = 'Budget';
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
const RETENTION_DAYS = 90; // 3 months
const BACKUP_PREFIX = `backups/${PROJECT_NAME}/`;

async function backupCollection(collectionName) {
  console.log(`Backing up ${collectionName}...`);
  const collectionRef = db.collection(collectionName);
  const snapshot = await collectionRef.get();
  
  const data = [];
  snapshot.forEach(doc => {
    data.push({ id: doc.id, ...doc.data() });
  });

  // Sort by id for consistent ordering
  data.sort((a, b) => a.id.localeCompare(b.id));

  console.log(`  Found ${data.length} documents in ${collectionName}`);
  return data;
}

async function backupFirestoreData() {
  console.log('Starting Firestore backup...');
  const backupData = {};
  let totalDocs = 0;

  for (const collection of COLLECTIONS) {
    try {
      const data = await backupCollection(collection);
      backupData[collection] = data;
      totalDocs += data.length;
    } catch (error) {
      console.error(`Error backing up ${collection}:`, error.message);
      backupData[collection] = [];
    }
  }

  console.log(`  Backed up ${totalDocs} total documents across ${COLLECTIONS.length} collections`);
  return { collections: backupData, totalDocs, totalCollections: COLLECTIONS.length };
}

async function uploadBackupToStorage(backupData, timestamp) {
  const fileName = `${timestamp}-budget-data.json`;
  const filePath = `${BACKUP_PREFIX}${fileName}`;
  
  console.log(`Uploading ${fileName} to Firebase Storage...`);

  const backupOutput = {
    timestamp: new Date().toISOString(),
    ...backupData,
    metadata: {
      totalCollections: backupData.totalCollections,
      totalDocuments: backupData.totalDocs,
      backupDate: timestamp
    }
  };

  const jsonString = JSON.stringify(backupOutput, null, 2);
  const buffer = Buffer.from(jsonString, 'utf8');

  try {
    const file = bucket.file(filePath);
    const stream = file.createWriteStream({
      metadata: {
        contentType: 'application/json',
        metadata: {
          project: PROJECT_NAME,
          timestamp: new Date().toISOString()
        }
      }
    });

    return new Promise((resolve, reject) => {
      stream.on('error', (error) => {
        console.error(`  ❌ Upload failed:`, error.message);
        reject(error);
      });

      stream.on('finish', async () => {
        const [metadata] = await file.getMetadata();
        const sizeInBytes = parseInt(metadata.size || '0', 10);
        console.log(`  ✅ Uploaded: ${fileName} (${sizeInBytes} bytes)`);
        console.log(`  Path: ${filePath}`);
        resolve(filePath);
      });

      stream.end(buffer);
    });
  } catch (error) {
    console.error(`  ❌ Upload failed:`, error.message);
    throw error;
  }
}

async function cleanupOldBackups() {
  console.log('Checking for old backups to clean up...');
  
  try {
    const [files] = await bucket.getFiles({ prefix: BACKUP_PREFIX });
    
    if (files.length === 0) {
      console.log('  No existing backups found');
      return;
    }

    console.log(`  Found ${files.length} existing backup(s)`);

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (RETENTION_DAYS * 24 * 60 * 60 * 1000));
    
    const recentBackups = files.filter(file => {
      const fileDate = new Date(file.metadata.timeCreated);
      return fileDate > cutoffDate;
    });

    if (recentBackups.length === 0) {
      console.log('  ⚠️  No recent backups found - skipping cleanup to preserve data');
      return;
    }

    console.log(`  Found ${recentBackups.length} recent backup(s) (within ${RETENTION_DAYS} days)`);

    const oldBackups = files.filter(file => {
      const fileDate = new Date(file.metadata.timeCreated);
      return fileDate <= cutoffDate;
    });

    if (oldBackups.length === 0) {
      console.log('  No old backups to delete');
      return;
    }

    console.log(`  Deleting ${oldBackups.length} old backup(s)...`);
    
    for (const file of oldBackups) {
      try {
        await file.delete();
        const fileAge = Math.floor((now - new Date(file.metadata.timeCreated)) / (24 * 60 * 60 * 1000));
        console.log(`    Deleted: ${file.name} (${fileAge} days old)`);
      } catch (error) {
        console.error(`    Failed to delete ${file.name}:`, error.message);
      }
    }
  } catch (error) {
    console.error('  ❌ Cleanup failed:', error.message);
  }
}

async function testStorageConnection() {
  console.log('Testing Firebase Storage connection...');
  try {
    await bucket.getFiles({ prefix: BACKUP_PREFIX, maxResults: 1 });
    console.log(`  ✅ Connected to Firebase Storage bucket: ${bucket.name}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Storage connection failed:`, error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log(`\n💰 ${PROJECT_NAME} Database Backup to Firebase Storage`);
    console.log('='.repeat(60));
    console.log(`Firebase project: ${firebaseServiceAccount.project_id}`);
    console.log(`Storage bucket: ${bucket.name}`);
    console.log(`Backup path: ${BACKUP_PREFIX}`);
    console.log('='.repeat(60));
    
    console.log('\n[Step 0/4] Testing Firebase Storage connection...');
    await testStorageConnection();
    
    console.log('\n[Step 1/4] Backing up Firestore data...');
    const backupData = await backupFirestoreData();
    
    if (!backupData || backupData.totalDocs === 0) {
      console.log('⚠️  Warning: No data found to backup');
    }
    
    console.log('\n[Step 2/4] Uploading backup to Firebase Storage...');
    const timestamp = new Date().toISOString().split('T')[0];
    await uploadBackupToStorage(backupData, timestamp);
    
    console.log('\n[Step 3/4] Cleaning up old backups...');
    await cleanupOldBackups();
    
    console.log('\n✅ Backup completed successfully!');
    console.log(`📦 Backups stored in Firebase Storage: ${BACKUP_PREFIX}`);
    console.log(`🔒 Backups are private and secure`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Backup failed:', error.message);
    console.error('Full error:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

main();
