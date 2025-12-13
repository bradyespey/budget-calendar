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
const RETENTION_DAYS = 90; // Keep backups for 3 months

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
  
  // Clean up old backups (3-month rotation with safety check)
  await cleanupOldBackups(timestamp);
}

async function cleanupOldBackups(currentBackupDate) {
  console.log('\nCleaning up old backups...');
  
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const backupFiles = files.filter(f => f.endsWith('.encrypted.json'));
    
    if (backupFiles.length === 0) {
      console.log('  No existing backups found');
      return;
    }
    
    // Parse current backup date
    const currentDate = new Date(currentBackupDate + 'T00:00:00Z');
    const cutoffDate = new Date(currentDate);
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    
    // Safety check: Find most recent backup date
    const backupDates = backupFiles
      .map(f => {
        const match = f.match(/^(\d{4}-\d{2}-\d{2})-/);
        return match ? new Date(match[1] + 'T00:00:00Z') : null;
      })
      .filter(d => d !== null)
      .sort((a, b) => b - a);
    
    if (backupDates.length === 0) {
      console.log('  Could not parse backup dates, skipping cleanup');
      return;
    }
    
    const mostRecentBackupDate = backupDates[0];
    const daysSinceLastBackup = Math.floor((currentDate - mostRecentBackupDate) / (1000 * 60 * 60 * 24));
    
    // Safety check: Don't delete if no recent backup (within retention period)
    if (daysSinceLastBackup > RETENTION_DAYS) {
      console.log(`  ⚠️  Safety check: Most recent backup is ${daysSinceLastBackup} days old (beyond ${RETENTION_DAYS} day retention)`);
      console.log(`  Skipping cleanup to prevent data loss`);
      return;
    }
    
    // Delete backups older than retention period
    let deletedCount = 0;
    for (const file of backupFiles) {
      const match = file.match(/^(\d{4}-\d{2}-\d{2})-/);
      if (!match) continue;
      
      const fileDate = new Date(match[1] + 'T00:00:00Z');
      if (fileDate < cutoffDate) {
        const filePath = path.join(BACKUP_DIR, file);
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`  Deleted old backup: ${file}`);
      }
    }
    
    if (deletedCount === 0) {
      console.log(`  No backups older than ${RETENTION_DAYS} days found`);
    } else {
      console.log(`  Cleaned up ${deletedCount} old backup(s)`);
    }
  } catch (error) {
    console.error('  Error during cleanup:', error.message);
    // Don't fail the backup if cleanup fails
  }
}

backup().catch(error => {
  console.error('Backup failed:', error);
  process.exit(1);
});
