#!/usr/bin/env node

/**
 * Trigger nightly budget update workflow using Firebase SDK
 * This properly calls Firebase callable functions instead of raw HTTP
 */

import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Firebase config (same as frontend)
const firebaseConfig = {
  apiKey: "AIzaSyA8PBORjASZYT51SzcFng6itsQRaOYGo7I",
  authDomain: "budgetcalendar-e6538.firebaseapp.com",
  projectId: "budgetcalendar-e6538",
  storageBucket: "budgetcalendar-e6538.firebasestorage.app",
  messagingSenderId: "342823251353",
  appId: "1:342823251353:web:6a1e2bd82a1926b5897708"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

async function triggerRunAll() {
  console.log('🚀 Starting run all workflow...');
  
  try {
    const runAllFunction = httpsCallable(functions, 'runAll');
    const result = await runAllFunction({});
    console.log('✅ Run all completed successfully:', result.data);
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Run all failed:', error.message);
    process.exit(1);
  }
}

// Run the workflow
triggerRunAll();
