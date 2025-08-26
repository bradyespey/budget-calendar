import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

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

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');

// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export default app;

