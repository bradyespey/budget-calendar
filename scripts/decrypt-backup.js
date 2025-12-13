import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Usage: node scripts/decrypt-backup.js <encrypted-file> [output-file]
// Example: node scripts/decrypt-backup.js data-backups/2025-12-13-games.encrypted.json

if (process.argv.length < 3) {
  console.error('Usage: node scripts/decrypt-backup.js <encrypted-file> [output-file]');
  console.error('Example: node scripts/decrypt-backup.js data-backups/2025-12-13-games.encrypted.json');
  process.exit(1);
}

const encryptedFilePath = process.argv[2];
const outputFilePath = process.argv[3] || encryptedFilePath.replace('.encrypted.json', '.decrypted.json');

// Get encryption key from environment variable
if (!process.env.BACKUP_ENCRYPTION_KEY) {
  console.error('Error: BACKUP_ENCRYPTION_KEY environment variable is missing.');
  console.error('Set it with: export BACKUP_ENCRYPTION_KEY="your-key-here"');
  console.error('Or get it from GitHub Secrets for this project');
  process.exit(1);
}

const encryptionKey = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'base64');

if (encryptionKey.length !== 32) {
  console.error('Error: BACKUP_ENCRYPTION_KEY must be 32 bytes (base64 encoded).');
  process.exit(1);
}

// Decryption function
function decryptData(encryptedBase64, key) {
  // Decode from base64
  const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
  
  // Extract components: IV (16 bytes) + authTag (16 bytes) + encrypted data
  const iv = encryptedBuffer.slice(0, 16);
  const authTag = encryptedBuffer.slice(16, 32);
  const encrypted = encryptedBuffer.slice(32);
  
  // Create decipher
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  // Decrypt
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  // Parse JSON
  return JSON.parse(decrypted.toString('utf8'));
}

// Read encrypted file
if (!fs.existsSync(encryptedFilePath)) {
  console.error(`Error: File not found: ${encryptedFilePath}`);
  process.exit(1);
}

console.log(`Reading encrypted file: ${encryptedFilePath}`);
const encryptedData = fs.readFileSync(encryptedFilePath, 'utf8');

try {
  console.log('Decrypting...');
  const decryptedData = decryptData(encryptedData, encryptionKey);
  
  // Write decrypted file
  fs.writeFileSync(outputFilePath, JSON.stringify(decryptedData, null, 2));
  
  console.log(`\n✅ Decryption complete!`);
  console.log(`Decrypted file saved to: ${outputFilePath}`);
  console.log(`\nBackup metadata:`);
  console.log(`  Project: ${decryptedData.project}`);
  console.log(`  Backup date: ${decryptedData.metadata?.backupDate || decryptedData.timestamp}`);
  console.log(`  Total documents: ${decryptedData.metadata?.totalDocuments || 'N/A'}`);
  
  if (decryptedData.collections) {
    console.log(`  Collections: ${decryptedData.collections.join(', ')}`);
  } else if (decryptedData.collection) {
    console.log(`  Collection: ${decryptedData.collection}`);
  }
} catch (error) {
  console.error('\n❌ Decryption failed:', error.message);
  if (error.message.includes('Unsupported state') || error.message.includes('bad decrypt')) {
    console.error('\nPossible causes:');
    console.error('  1. Wrong encryption key (check BACKUP_ENCRYPTION_KEY)');
    console.error('  2. File is corrupted');
    console.error('  3. File was encrypted with a different key');
  }
  process.exit(1);
}
