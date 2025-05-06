//src/context/AuthContext.tsx

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Session, User } from '../types';

interface AuthContextType {
  session: Session;
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
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(defaultSession);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getInitialSession() {
      try {
        setLoading(true);
        
        const { data: { session: supabaseSession } } = await supabase.auth.getSession();
        
        if (supabaseSession) {
          setSession({
            user: {
              id: supabaseSession.user.id,
              email: supabaseSession.user.email || '',
            },
            isAuthenticated: true,
          });
        }
      } catch (error) {
        console.error('Error getting initial session:', error);
      } finally {
        setLoading(false);
      }
    }

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, supabaseSession) => {
        if (supabaseSession) {
          setSession({
            user: {
              id: supabaseSession.user.id,
              email: supabaseSession.user.email || '',
            },
            isAuthenticated: true,
          });
        } else {
          setSession(defaultSession);
        }
        
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        },
      });

      if (error) {
        console.error('Error signing in:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setSession(defaultSession);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}