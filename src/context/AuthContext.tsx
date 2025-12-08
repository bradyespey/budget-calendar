//src/context/AuthContext.tsx

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebaseConfig';
import { Session } from '../types';

interface AuthContextType {
  session: Session;
  userRole: 'admin' | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const defaultSession: Session = {
  user: null,
  isAuthenticated: false,
};

const AuthContext = createContext<AuthContextType>({
  session: defaultSession,
  userRole: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(defaultSession);
  const [userRole, setUserRole] = useState<'admin' | null>(null);
  const [loading, setLoading] = useState(true);

  // Fallback to hardcoded emails if env var is missing
  const allowedEmails = import.meta.env.VITE_ALLOWED_EMAILS?.split(',') || [
    'baespey@gmail.com',
    'jennycespey@gmail.com', 
    'bradyjennytx@gmail.com'
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && allowedEmails.includes(user.email || '')) {
        setSession({
          user: {
            id: user.uid,
            email: user.email || '',
          },
          isAuthenticated: true,
        });
        await handleUserDocument(user);
      } else {
        setSession(defaultSession);
        setUserRole(null);
        if (user) {
          // User not authorized - show warning but don't crash
          console.warn(`Access denied. Email ${user.email} is not authorized.`);
          alert(`Access denied. Email ${user.email} is not authorized. Allowed: ${allowedEmails.join(', ')}`);
          await firebaseSignOut(auth);
        }
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [allowedEmails]);

  const handleUserDocument = async (user: User) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        setUserRole(userDoc.data().role || 'admin');
      } else {
        // Create new user document - everyone is admin
        const newUserData = {
          email: user.email,
          name: user.displayName,
          role: 'admin',
          createdAt: new Date().toISOString(),
        };
        
        await setDoc(userDocRef, newUserData);
        setUserRole('admin');
      }
    } catch (error) {
      console.error('Error handling user document:', error);
      setUserRole('admin'); // Default to admin on error
    }
  };

  const signIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setSession(defaultSession);
      setUserRole(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ session, userRole, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}