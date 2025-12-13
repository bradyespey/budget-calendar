import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('Error: FIREBASE_SERVICE_ACCOUNT environment variable is missing.');
  process.exit(1);
}

if (!process.env.BACKUP_ENCRYPTION_KEY) {
  console.error('Error: BACKUP_ENCRYPTION_KEY environment variable is missing.');
  console.error('Generate a key with: openssl rand -base64 32');
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const encryptionKey = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'base64');

if (encryptionKey.length !== 32) {
  console.error('Error: BACKUP_ENCRYPTION_KEY must be 32 bytes (base64 encoded).');
  console.error('Generate a key with: openssl rand -base64 32');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Encryption functions
function encryptData(data, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(JSON.stringify(data), 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV + authTag + encrypted data
  const result = Buffer.concat([
    iv,
    authTag,
    encrypted
  ]);
  
  return result.toString('base64');
}

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
const BACKUP_DIR = path.join(__dirname, '../data-backups');

async function backupCollection(collectionName) {
  console.log(`  Backing up ${collectionName}...`);
  const collectionRef = db.collection(collectionName);
  const snapshot = await collectionRef.get();
  
  const documents = [];
  snapshot.forEach(doc => {
    documents.push({ id: doc.id, ...doc.data() });
  });

  console.log(`    ✓ ${documents.length} documents`);
  return documents;
}

async function backupFirestoreData() {
  console.log('Starting Firestore backup...');
  const backupData = {};
  
  for (const collectionName of COLLECTIONS) {
    backupData[collectionName] = await backupCollection(collectionName);
  }

  const totalDocs = Object.values(backupData).reduce((sum, docs) => sum + docs.length, 0);
  console.log(`  Total: ${totalDocs} documents across ${COLLECTIONS.length} collections`);
  
  return backupData;
}

async function backup() {
  console.log('Starting encrypted backup...');
  
  // Create backups directory if it doesn't exist
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Backup Firestore data
  const backupData = await backupFirestoreData();
  
  const totalDocs = Object.values(backupData).reduce((sum, docs) => sum + docs.length, 0);
  
  const backupOutput = {
    timestamp: new Date().toISOString(),
    project: PROJECT_NAME,
    collections: COLLECTIONS,
    data: backupData,
    metadata: {
      totalDocuments: totalDocs,
      backupDate: new Date().toISOString().split('T')[0],
      collectionCounts: Object.fromEntries(
        Object.entries(backupData).map(([name, docs]) => [name, docs.length])
      )
    }
  };

  // Encrypt the backup
  console.log('Encrypting backup data...');
  const encrypted = encryptData(backupOutput, encryptionKey);
  
  // Write encrypted backup file
  const timestamp = new Date().toISOString().split('T')[0];
  const filePath = path.join(BACKUP_DIR, `${timestamp}-backup.encrypted.json`);
  
  fs.writeFileSync(filePath, encrypted);
  
  console.log(`\n✅ Encrypted backup complete!`);
  console.log(`Total documents: ${totalDocs}`);
  console.log(`Collections: ${COLLECTIONS.join(', ')}`);
  console.log(`Saved to: ${filePath}`);
  console.log(`🔒 Backup is encrypted and secure`);
}

backup().catch(error => {
  console.error('Backup failed:', error);
  process.exit(1);
});
