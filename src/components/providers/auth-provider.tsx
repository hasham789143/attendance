'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Auth, User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, Firestore } from 'firebase/firestore';
import { useFirebase } from '@/firebase';
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
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { auth, firestore } = useFirebase();

  useEffect(() => {
    if (!auth || !firestore) return;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const userDocRef = doc(firestore, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const profileData = userDoc.data() as UserProfile;
          if (profileData.role === 'disabled') {
            setUserProfile(null);
            setUser(null);
            await firebaseSignOut(auth);
            router.replace('/login');
          } else {
            setUserProfile(profileData);
          }
        } else {
          // If no profile, maybe they just registered.
          // Or this is an error condition. For now, we clear the profile.
          setUserProfile(null);
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth, firestore, router]);

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

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, logout }}>
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
