import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Validate API key is present
if (!firebaseConfig.apiKey || firebaseConfig.apiKey.trim() === '') {
  console.error('❌ VITE_FIREBASE_API_KEY is missing or empty');
  throw new Error('Firebase API key is not configured. Check environment variables.');
}

// Initialize Firebase - ONCE, at module scope, never re-initialized
const app = initializeApp(firebaseConfig);

// Initialize Firebase services - these are stable references
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');

const localFunctionsBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_BASE_URL as string | undefined;

if (import.meta.env.DEV && localFunctionsBaseUrl) {
  try {
    const emulatorUrl = new URL(localFunctionsBaseUrl);
    connectFunctionsEmulator(functions, emulatorUrl.hostname, Number(emulatorUrl.port || 5001));
  } catch (error) {
    console.error('Failed to configure local Firebase Functions emulator:', error);
  }
}

// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export default app;
