'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Auth, User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, Firestore } from 'firebase/firestore';
import { useDoc, useFirebase, useMemoFirebase } from '@/firebase';
import { Loader2 } from 'lucide-react';

// The shape of the user profile stored in Firestore
export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'viewer' | 'disabled';
  roll?: string;
}

// The shape of the context value
interface AuthContextType {
  user: User | null; // Firebase Auth user
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth, firestore, user: authUser, isUserLoading: isAuthLoading } = useFirebase();
  const router = useRouter();

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !authUser) return null;
    return doc(firestore, 'users', authUser.uid);
  }, [firestore, authUser]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const loading = isAuthLoading || (!!authUser && isProfileLoading);

  useEffect(() => {
    if (!loading && authUser && userProfile?.role === 'disabled') {
      firebaseSignOut(auth);
      router.replace('/login');
    }
  }, [loading, authUser, userProfile, auth, router]);
  
  const logout = useCallback(async () => {
    if (auth) {
      await firebaseSignOut(auth);
      router.push('/login');
    }
  }, [auth, router]);
  
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // userProfile can be null if doc doesn't exist.
  const profile = userProfile ? { ...userProfile, id: userProfile.uid } as UserProfile : null;

  return (
    <AuthContext.Provider value={{ user: authUser, userProfile: profile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
