#!/usr/bin/env tsx
/**
 * Cleanup Script: Remove Supabase Dependencies
 * 
 * ⚠️ WARNING: Only run this AFTER confirming Firebase migration works in production!
 * 
 * This script will:
 * 1. Remove @supabase/supabase-js from package.json
 * 2. Remove Supabase imports from all files
 * 3. Clean up environment variables
 * 4. Remove old Supabase configuration files
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const projectRoot = process.cwd();

function log(message: string) {
  console.log(`🧹 ${message}`);
}

function warn(message: string) {
  console.log(`⚠️  ${message}`);
}

function success(message: string) {
  console.log(`✅ ${message}`);
}

async function cleanupSupabase() {
  console.log('🚀 Starting Supabase cleanup...\n');

  // 1. Remove Supabase package
  try {
    log('Removing @supabase/supabase-js package...');
    execSync('npm uninstall @supabase/supabase-js', { stdio: 'inherit' });
    success('Supabase package removed');
  } catch (error) {
    warn('Could not remove Supabase package - you may need to do this manually');
  }

  // 2. Remove old Supabase configuration file
  const supabaseConfigPath = join(projectRoot, 'src/lib/supabase.ts');
  if (existsSync(supabaseConfigPath)) {
    log('Removing old Supabase configuration file...');
    unlinkSync(supabaseConfigPath);
    success('Removed src/lib/supabase.ts');
  }

  // 3. Clean up .env file
  const envPath = join(projectRoot, '.env');
  if (existsSync(envPath)) {
    log('Cleaning up .env file...');
    const envContent = readFileSync(envPath, 'utf-8');
    
    // Remove Supabase environment variables
    const cleanedEnv = envContent
      .split('\n')
      .filter(line => {
        const supabaseVars = [
          'VITE_SUPABASE_URL',
          'VITE_SUPABASE_ANON_KEY', 
          'VITE_SUPABASE_FUNCTIONS_URL'
        ];
        return !supabaseVars.some(varName => line.startsWith(varName));
      })
      .join('\n');
    
    writeFileSync(envPath, cleanedEnv);
    success('Cleaned up .env file (removed Supabase variables)');
  }

  // 4. List files that might still have Supabase imports (for manual review)
  log('Checking for remaining Supabase references...');
  try {
    const grepResult = execSync('grep -r "supabase" src/ --exclude-dir=node_modules || true', { encoding: 'utf-8' });
    if (grepResult.trim()) {
      warn('Found remaining Supabase references:');
      console.log(grepResult);
      warn('You may want to review and remove these manually');
    } else {
      success('No remaining Supabase references found in src/');
    }
  } catch (error) {
    warn('Could not search for Supabase references');
  }

  console.log('\n🎉 Supabase cleanup completed!');
  console.log('\nNext steps:');
  console.log('1. Test your app thoroughly: npm run dev');
  console.log('2. Run type check: npm run type-check');  
  console.log('3. Build for production: npm run build');
  console.log('4. Deploy to production');
  console.log('5. Archive your Supabase project in the console');
}

// Run cleanup
cleanupSupabase().catch(error => {
  console.error('❌ Cleanup failed:', error);
  process.exit(1);
});
